'use cache';

import { getLocale, getTranslations } from 'next-intl/server';
// import { cache } from 'react';

import { HeaderSection } from '@/vibes/soul/sections/header-section';
import { LayoutQuery } from '~/app/[locale]/(default)/query';
import { client } from '~/client';
import { readFragment } from '~/client/graphql';
import { revalidate } from '~/client/revalidate-target';
// import { logoTransformer } from '~/data-transformers/logo-transformer';
import { routing } from '~/i18n/routing';
// import { getPreferredCurrencyCode } from '~/lib/currency';

import { search } from './_actions/search';
// import { switchCurrency } from './_actions/switch-currency';
import { switchLocale } from './_actions/switch-locale';
import { HeaderFragment } from './fragment';

const getLayoutData = async () => {
  const { data: response } = await client.fetch({
    document: LayoutQuery,
    fetchOptions: { next: { revalidate } },
  });

  return readFragment(HeaderFragment, response).site;
};

export const StaticHeader = async () => {
  const t = await getTranslations('Components.Header');
  const locale = await getLocale();

  const locales = routing.locales.map((enabledLocales) => ({
    id: enabledLocales,
    label: enabledLocales.toLocaleUpperCase(),
  }));

  const data = await getLayoutData();

  // const currencyCode = await getPreferredCurrencyCode();
  // const currencies = data.currencies.edges
  //   ? // only show transactional currencies for now until cart prices can be rendered in display currencies
  //     data.currencies.edges
  //       .filter(({ node }) => node.isTransactional)
  //       .map(({ node }) => ({
  //         id: node.code,
  //         label: node.code,
  //         isDefault: node.isDefault,
  //       }))
  //   : [];
  // const defaultCurrency = currencies.find(({ isDefault }) => isDefault);
  // const activeCurrencyId = currencyCode ?? defaultCurrency?.id;

  // /**  To prevent the navigation menu from overflowing, we limit the number of categories to 6.
  //  To show a full list of categories, modify the `slice` method to remove the limit.
  //  Will require modification of navigation menu styles to accommodate the additional categories.
  //  */
  const links = data.categoryTree.slice(0, 6).map(({ name, path, children }) => ({
    label: name,
    href: path,
    groups: children.map((firstChild) => ({
      label: firstChild.name,
      href: firstChild.path,
      links: firstChild.children.map((secondChild) => ({
        label: secondChild.name,
        href: secondChild.path,
      })),
    })),
  }));

  // const logo = data.settings ? logoTransformer(data.settings) : '';

  return (
    <HeaderSection
      navigation={{
        accountHref: '/login',
        accountLabel: t('Icons.account'),
        cartHref: '/cart',
        cartLabel: t('Icons.cart'),
        searchHref: '/search',
        searchLabel: t('Icons.search'),
        searchParamName: 'term',
        searchAction: search,
        links,
        logo: '',
        mobileMenuTriggerLabel: t('toggleNavigation'),
        openSearchPopupLabel: t('Search.openSearchPopup'),
        logoLabel: t('home'),
        cartCount: 0,
        activeLocaleId: locale,
        locales,
        localeAction: switchLocale,
        // currencies,
        // activeCurrencyId,
        // currencyAction: switchCurrency,
      }}
    />
  );
};
