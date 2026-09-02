# Self-hosted fonts

All three families are licensed under the **SIL Open Font License 1.1**
(https://openfontlicense.org). The `.woff2` files here were obtained from the
projects' legitimate upstream distributions; no binary was fabricated or
modified.

| File | Family | Axis | Source |
| --- | --- | --- | --- |
| `Fraunces-Variable.woff2` | Fraunces (display / headings) | `wght` 100-900, Latin subset | github.com/googlefonts/fraunces via `@fontsource-variable/fraunces` 5.0.19 |
| `Inter-Variable.woff2` | Inter (body / UI) | `wght` 100-900, Latin subset | github.com/rsms/inter via `@fontsource-variable/inter` 5.0.18 |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono (metadata / IDs) | 400, Latin subset | github.com/IBM/plex via `@fontsource/ibm-plex-mono` 5.0.13 |
| `IBMPlexMono-Medium.woff2` | IBM Plex Mono | 500, Latin subset | github.com/IBM/plex via `@fontsource/ibm-plex-mono` 5.0.13 |

No npm font dependency is installed and no runtime request is made to Google
Fonts or any third-party host: the `@font-face` rules in `src/styles/fonts.css`
reference only these local files, with `font-display: swap` and real fallback
stacks so the app renders correctly before the faces load.

Full OFL license text: https://openfontlicense.org/open-font-license-official-text/
- Fraunces © The Fraunces Project Authors (github.com/googlefonts/fraunces)
- Inter © The Inter Project Authors (github.com/rsms/inter)
- IBM Plex © 2017 IBM Corp. (github.com/IBM/plex)
