'use client';

import Script from 'next/script';
import { Session } from 'next-auth';

import { useB2BAuth } from './use-b2b-auth';

export function B2BProductionScripts({
  storeHash,
  channelId,
  session,
}: {
  storeHash: string;
  channelId: string;
  session: Session | null;
}) {
  useB2BAuth(session);

  return (
    <>
      <Script id="b2b-config">
        {`
            window.B3 = {
              setting: {
                store_hash: '${storeHash}',
                channel_id: ${channelId},
                platform: 'catalyst',
                cart_url: '/cart',
              }
            }
        `}
      </Script>
      <Script
        data-channelid={channelId}
        data-storehash={storeHash}
        src="https://cdn.bundleb2b.net/b2b/production/storefront/headless.js"
        type="module"
      />
    </>
  );
}
