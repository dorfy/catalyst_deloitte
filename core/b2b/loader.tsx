import { auth } from '~/auth';

import { B2BProductionScripts } from './scripts';

export async function B2BLoader() {
  const session = await auth();
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const channelId = process.env.BIGCOMMERCE_CHANNEL_ID;

  if (!storeHash || !channelId) {
    throw new Error('BIGCOMMERCE_STORE_HASH or BIGCOMMERCE_CHANNEL_ID is not set');
  }

  return <B2BProductionScripts channelId={channelId} session={session} storeHash={storeHash} />;
}
