import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'EchoMirror SDK',
  tagline: 'Mood intelligence, Stellar payments, and social wellness for any app',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://karanjadavi.github.io',
  baseUrl: '/echomirror-sdk/',

  organizationName: 'karanjadavi',
  projectName: 'echomirror-sdk',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: [
          '../packages/js/core/src/index.ts',
          '../packages/js/mood/src/index.ts',
          '../packages/js/react/src/index.tsx',
          '../packages/js/stellar/src/index.ts',
        ],
        tsconfig: '../tsconfig.json',
       out: 'docs/api/js',
        readme: 'none',
        validation: { notDocumented: true },
        treatValidationWarningsAsErrors: true,
        sidebar: {
          pretty: true,
        },
      },
    ],
  ],

  themes: ['@easyops-cn/docusaurus-search-local'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/karanjadavi/echomirror-sdk/tree/main/docs-site/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'EchoMirror SDK',
      logo: {
        alt: 'EchoMirror SDK Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/karanjadavi/echomirror-sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Introduction',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Issues',
              href: 'https://github.com/karanjadavi/echomirror-sdk/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/karanjadavi/echomirror-sdk',
            },
          ],
        },
      ],
      copyright: `Copyright   ${new Date().getFullYear()} EchoMirror SDK. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
