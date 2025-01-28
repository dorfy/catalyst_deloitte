import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

interface Params {
  params: Promise<{ locale: string }>;
}

export default async function CatchAllPage({ params }: Params) {
  const { locale } = await params;

  setRequestLocale(locale);

  notFound();
}
