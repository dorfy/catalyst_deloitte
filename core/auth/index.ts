import { decodeJwt } from 'jose';
import NextAuth, { type DefaultSession, type NextAuthConfig, User } from 'next-auth';
import 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';

import { client } from '~/client';
import { graphql, ResultOf } from '~/client/graphql';
import { getCartId } from '~/lib/cart';

const LoginMutation = graphql(`
  mutation LoginMutation($email: String!, $password: String!, $cartEntityId: String) {
    login(email: $email, password: $password, guestCartEntityId: $cartEntityId) {
      customerAccessToken {
        value
        expiresAt
      }
      customer {
        entityId
        firstName
        lastName
        email
      }
    }
  }
`);

const LoginWithTokenMutation = graphql(`
  mutation LoginWithCustomerLoginJwtMutation($jwt: String!, $cartEntityId: String) {
    loginWithCustomerLoginJwt(jwt: $jwt, guestCartEntityId: $cartEntityId) {
      customerAccessToken {
        value
        expiresAt
      }
      customer {
        entityId
        firstName
        lastName
        email
      }
    }
  }
`);

const LogoutMutation = graphql(`
  mutation LogoutMutation {
    logout {
      result
    }
  }
`);

const PasswordCredentials = z.object({
  type: z.literal('password'),
  email: z.string().email(),
  password: z.string().min(1),
});

const JwtCredentials = z.object({
  type: z.literal('jwt'),
  jwt: z.string(),
});

export const Credentials = z.discriminatedUnion('type', [PasswordCredentials, JwtCredentials]);

async function loginWithPassword(
  email: string,
  password: string,
  cartEntityId?: string,
): Promise<User | null> {
  const response = await client.fetch({
    document: LoginMutation,
    variables: { email, password, cartEntityId },
    fetchOptions: {
      cache: 'no-store',
    },
  });

  if (response.errors && response.errors.length > 0) {
    return null;
  }

  const result = response.data.login;

  if (!result.customer || !result.customerAccessToken) {
    return null;
  }

  return {
    name: `${result.customer.firstName} ${result.customer.lastName}`,
    email: result.customer.email,
    customerAccessToken: result.customerAccessToken.value,
    ...(process.env.B2B_API_TOKEN && {
      b2bToken: await loginWithB2B({
        customer: result.customer,
        customerAccessToken: result.customerAccessToken,
      }),
    }),
  };
}

async function loginWithJwt(jwt: string, cartEntityId?: string): Promise<User | null> {
  const claims = decodeJwt(jwt);
  const channelId = claims.channel_id?.toString() ?? process.env.BIGCOMMERCE_CHANNEL_ID;
  const impersonatorId = claims.impersonator_id?.toString() ?? null;
  const response = await client.fetch({
    document: LoginWithTokenMutation,
    variables: { jwt, cartEntityId },
    channelId,
    fetchOptions: {
      cache: 'no-store',
    },
  });

  if (response.errors && response.errors.length > 0) {
    return null;
  }

  const result = response.data.loginWithCustomerLoginJwt;

  if (!result.customer || !result.customerAccessToken) {
    return null;
  }

  return {
    name: `${result.customer.firstName} ${result.customer.lastName}`,
    email: result.customer.email,
    customerAccessToken: result.customerAccessToken.value,
    impersonatorId,
    ...(process.env.B2B_API_TOKEN && {
      b2bToken: await loginWithB2B({
        customer: result.customer,
        customerAccessToken: result.customerAccessToken,
      }),
    }),
  };
}

interface LoginWithB2BParams {
  customer: NonNullable<ResultOf<typeof LoginMutation>['login']['customer']>;
  customerAccessToken: NonNullable<ResultOf<typeof LoginMutation>['login']['customerAccessToken']>;
}

async function loginWithB2B({ customer, customerAccessToken }: LoginWithB2BParams) {
  if (!process.env.B2B_API_TOKEN) {
    throw new Error('Environment variable B2B_API_TOKEN is not set');
  }

  const channelId = process.env.BIGCOMMERCE_CHANNEL_ID;

  const payload = {
    channelId,
    customerId: customer.entityId,
    customerAccessToken,
  };

  const response = await fetch(`https://api-b2b.bigcommerce.com/api/io/auth/customers/storefront`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      authToken: process.env.B2B_API_TOKEN,
    },
    body: JSON.stringify(payload),
  });

  const B2BTokenResponseSchema = z.object({
    data: z.object({
      token: z.array(z.string()),
    }),
  });

  const {
    data: { token },
  } = B2BTokenResponseSchema.parse(await response.json());

  if (!token[0]) {
    throw new Error('No token returned from B2B API');
  }

  return token[0];
}

async function authorize(credentials: unknown): Promise<User | null> {
  const parsed = Credentials.parse(credentials);
  const cartEntityId = await getCartId();

  switch (parsed.type) {
    case 'password': {
      const { email, password } = parsed;

      return loginWithPassword(email, password, cartEntityId);
    }

    case 'jwt': {
      const { jwt } = parsed;

      return loginWithJwt(jwt, cartEntityId);
    }

    default:
      return null;
  }
}

const config = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt: ({ token, user }) => {
      // user can actually be undefined
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!user) {
        return token;
      }

      if (user.customerAccessToken) {
        token.customerAccessToken = user.customerAccessToken;
      }

      if (user.b2bToken) {
        token.b2bToken = user.b2bToken;
      }

      return token;
    },
    session({ session, token }) {
      if (token.customerAccessToken) {
        session.customerAccessToken = token.customerAccessToken;
      }

      if (token.b2bToken) {
        session.b2bToken = token.b2bToken;
      }

      return session;
    },
  },
  events: {
    async signOut(message) {
      const customerAccessToken = 'token' in message ? message.token?.customerAccessToken : null;
      // @todo check if b2bToken is also valid?

      if (customerAccessToken) {
        try {
          await client.fetch({
            document: LogoutMutation,
            variables: {},
            customerAccessToken,
            fetchOptions: {
              cache: 'no-store',
            },
          });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    },
  },
  providers: [
    CredentialsProvider({
      credentials: {
        type: { type: 'text' },
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        jwt: { type: 'text' },
      },
      authorize,
    }),
  ],
} satisfies NextAuthConfig;

const { handlers, auth, signIn: nextAuthSignIn, signOut } = NextAuth(config);

const signIn = (
  credentials: z.infer<typeof Credentials>,
  options: { redirect?: boolean | undefined; redirectTo?: string },
) => nextAuthSignIn('credentials', { ...credentials, ...options });

const getSessionCustomerAccessToken = async () => {
  try {
    const session = await auth();

    return session?.customerAccessToken;
  } catch {
    // No empty
  }
};

export { handlers, auth, signIn, signOut, getSessionCustomerAccessToken };

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'];
    customerAccessToken?: string;
    b2bToken?: string;
  }

  interface User {
    name?: string | null;
    email?: string | null;
    customerAccessToken?: string;
    impersonatorId?: string | null;
    b2bToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    customerAccessToken?: string;
    b2bToken?: string;
  }
}
