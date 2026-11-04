# Changelog

## [1.25.0](https://github.com/Flare-Labs/flare-ai/compare/v1.24.0...v1.25.0) (2025-10-30)


### Features

* s3 storage and richer file support ([#301](https://github.com/Flare-Labs/flare-ai/issues/301)) ([051a974](https://github.com/Flare-Labs/flare-ai/commit/051a9740a6ecf774bfead9ce327c376ea5b279a5)) by @mrjasonroy


### Bug Fixes

* model name for gpt-4.1-mini in staticModels ([#299](https://github.com/Flare-Labs/flare-ai/issues/299)) ([4513ac0](https://github.com/Flare-Labs/flare-ai/commit/4513ac0e842f588a24d7075af8700e3cc7a3eb39)) by @mayur9210

## [1.24.0](https://github.com/Flare-Labs/flare-ai/compare/v1.23.0...v1.24.0) (2025-10-06)


### Features

* generate image Tool (Nano Banana) ([#284](https://github.com/Flare-Labs/flare-ai/issues/284)) ([984ce66](https://github.com/Flare-Labs/flare-ai/commit/984ce665ceef7225870f4eb751afaf65bf8a2dd4)) by @Flare-Labs
* openai image generate ([#287](https://github.com/Flare-Labs/flare-ai/issues/287)) ([0deef6e](https://github.com/Flare-Labs/flare-ai/commit/0deef6e8a83196afb1f44444ab2f13415de20e73)) by @Flare-Labs

## [1.23.0](https://github.com/Flare-Labs/flare-ai/compare/v1.22.0...v1.23.0) (2025-10-04)


### Features

* export chat thread ([#278](https://github.com/Flare-Labs/flare-ai/issues/278)) ([23e79cd](https://github.com/Flare-Labs/flare-ai/commit/23e79cd570c24bab0abc496eca639bfffcb6060b)) by @Flare-Labs
* **file-storage:** image uploads, generate profile with ai ([#257](https://github.com/Flare-Labs/flare-ai/issues/257)) ([46eb43f](https://github.com/Flare-Labs/flare-ai/commit/46eb43f84792d48c450f3853b48b24419f67c7a1)) by @brrock


### Bug Fixes

* Apply DISABLE_SIGN_UP to OAuth providers ([#282](https://github.com/Flare-Labs/flare-ai/issues/282)) ([bcc0db8](https://github.com/Flare-Labs/flare-ai/commit/bcc0db8eb81997e54e8904e64fc76229fbfc1338)) by @raunak-bot
* ollama disable issue ([#283](https://github.com/Flare-Labs/flare-ai/issues/283)) ([5e0a690](https://github.com/Flare-Labs/flare-ai/commit/5e0a690bb6c3f074680d13e09165ca9fff139f93)) by @Flare-Labs

## [1.22.0](https://github.com/Flare-Labs/flare-ai/compare/v1.21.0...v1.22.0) (2025-09-25)

### Features

- admin and roles ([#270](https://github.com/Flare-Labs/flare-ai/issues/270)) ([63bddca](https://github.com/Flare-Labs/flare-ai/commit/63bddcaa4bc62bc85204a0982a06f2bed09fc5f5)) by @mrjasonroy
- groq provider ([#268](https://github.com/Flare-Labs/flare-ai/issues/268)) ([aef213d](https://github.com/Flare-Labs/flare-ai/commit/aef213d2f9dd0255996cc4184b03425db243cd7b)) by @Flare-Labs
- hide LLM providers without API keys in model selection ([#269](https://github.com/Flare-Labs/flare-ai/issues/269)) ([63c15dd](https://github.com/Flare-Labs/flare-ai/commit/63c15dd386ea99b8fa56f7b6cb1e58e5779b525d)) by @Flare-Labs
- **voice-chat:** binding agent tools ([#275](https://github.com/Flare-Labs/flare-ai/issues/275)) ([ed45e82](https://github.com/Flare-Labs/flare-ai/commit/ed45e822eb36447f2a02ef3aa69eeec88009e357)) by @Flare-Labs

### Bug Fixes

- ensure PKCE works for MCP Server auth ([#256](https://github.com/Flare-Labs/flare-ai/issues/256)) ([09b938f](https://github.com/Flare-Labs/flare-ai/commit/09b938f17ca78993a1c7b84c5a702b95159542b2)) by @jvg123

## [1.21.0](https://github.com/Flare-Labs/flare-ai/compare/v1.20.2...v1.21.0) (2025-08-24)

### Features

- agent sharing ([#226](https://github.com/Flare-Labs/flare-ai/issues/226)) ([090dd8f](https://github.com/Flare-Labs/flare-ai/commit/090dd8f4bf4fb82beb2cd9bfa0b427425bbbf352)) by @mrjasonroy
- ai v5 ([#230](https://github.com/Flare-Labs/flare-ai/issues/230)) ([0461879](https://github.com/Flare-Labs/flare-ai/commit/0461879740860055a278c96656328367980fa533)) by @Flare-Labs
- improve markdown table styling ([#244](https://github.com/Flare-Labs/flare-ai/issues/244)) ([7338e04](https://github.com/Flare-Labs/flare-ai/commit/7338e046196f72a7cc8ec7903593d94ecabcc05e)) by @hakonharnes

### Bug Fixes

- [#111](https://github.com/Flare-Labs/flare-ai/issues/111) prevent MCP server disconnection during long-running tool calls ([#238](https://github.com/Flare-Labs/flare-ai/issues/238)) ([b5bb3dc](https://github.com/Flare-Labs/flare-ai/commit/b5bb3dc40a025648ecd78f547e0e1a2edd8681ca)) by @Flare-Labs

## [1.20.2](https://github.com/Flare-Labs/flare-ai/compare/v1.20.1...v1.20.2) (2025-08-09)

### Bug Fixes

- improve error display with better UX and animation handling ([#227](https://github.com/Flare-Labs/flare-ai/issues/227)) ([35d62e0](https://github.com/Flare-Labs/flare-ai/commit/35d62e05bb21760086c184511d8062444619696c)) by @Flare-Labs
- **mcp:** ensure database and memory manager sync across server instances ([#229](https://github.com/Flare-Labs/flare-ai/issues/229)) ([c4b8ebe](https://github.com/Flare-Labs/flare-ai/commit/c4b8ebe9566530986951671e36111a2e529bf592)) by @Flare-Labs

## [1.20.1](https://github.com/Flare-Labs/flare-ai/compare/v1.20.0...v1.20.1) (2025-08-06)

### Bug Fixes

- **mcp:** fix MCP infinite loading issue ([#220](https://github.com/Flare-Labs/flare-ai/issues/220)) ([c25e351](https://github.com/Flare-Labs/flare-ai/commit/c25e3515867c76cc5494a67e79711e9343196078)) by @raunak-bot

## [1.20.0](https://github.com/Flare-Labs/flare-ai/compare/v1.19.1...v1.20.0) (2025-08-04)

### Features

- add qwen3 coder to models file for openrouter ([#206](https://github.com/Flare-Labs/flare-ai/issues/206)) ([3731d00](https://github.com/Flare-Labs/flare-ai/commit/3731d007100ac36a814704f8bde8398ce1378a4e)) by @brrock
- improve authentication configuration and social login handling ([#211](https://github.com/Flare-Labs/flare-ai/issues/211)) ([cd25937](https://github.com/Flare-Labs/flare-ai/commit/cd25937020710138ab82458e70ea7f6cabfd03ca)) by @mrjasonroy
- introduce interactive table creation and enhance visualization tools ([#205](https://github.com/Flare-Labs/flare-ai/issues/205)) ([623a736](https://github.com/Flare-Labs/flare-ai/commit/623a736f6895b8737acaa06811088be2dc1d0b3c)) by @raunak-bot
- **mcp:** oauth ([#208](https://github.com/Flare-Labs/flare-ai/issues/208)) ([136aded](https://github.com/Flare-Labs/flare-ai/commit/136aded6de716367380ff64c2452d1b4afe4aa7f)) by @Flare-Labs
- **web-search:** replace Tavily API with Exa AI integration ([#204](https://github.com/Flare-Labs/flare-ai/issues/204)) ([7140487](https://github.com/Flare-Labs/flare-ai/commit/7140487dcdadb6c5cb6af08f92b06d42411f7168)) by @raunak-bot

### Bug Fixes

- implement responsive horizontal layout for chat mention input with improved UX And generate Agent Prompt ([43ec980](https://github.com/Flare-Labs/flare-ai/commit/43ec98059e0d27ab819491518263df55fb1c9ad3)) by @Flare-Labs
- **mcp:** Safe MCP manager init logic for the Vercel environment ([#202](https://github.com/Flare-Labs/flare-ai/issues/202)) ([708fdfc](https://github.com/Flare-Labs/flare-ai/commit/708fdfcfed70299044a90773d3c9a76c9a139f2f)) by @raunak-bot

## [1.19.1](https://github.com/Flare-Labs/flare-ai/compare/v1.19.0...v1.19.1) (2025-07-29)

### Bug Fixes

- **agent:** improve agent loading logic and validation handling in EditAgent component [#198](https://github.com/Flare-Labs/flare-ai/issues/198) ([ec034ab](https://github.com/Flare-Labs/flare-ai/commit/ec034ab51dfc656d7378eca1e2b4dc94fbb67863)) by @Flare-Labs
- **agent:** update description field to allow nullish values in ChatMentionSchema ([3e4532d](https://github.com/Flare-Labs/flare-ai/commit/3e4532d4c7b561ad03836c743eefb7cd35fe9e74)) by @Flare-Labs
- **i18n:** update agent description fields in English, Spanish, and French JSON files to improve clarity and consistency ([f07d1c4](https://github.com/Flare-Labs/flare-ai/commit/f07d1c4dc64b96584faa7e558f981199834a5370)) by @Flare-Labs
- Invalid 'tools': array too long. Expected an array with maximum length 128, but got an array with length 217 instead. [#197](https://github.com/Flare-Labs/flare-ai/issues/197) ([b967e3a](https://github.com/Flare-Labs/flare-ai/commit/b967e3a30be3a8a48f3801b916e26ac4d7dd50f4)) by @Flare-Labs

## [1.19.0](https://github.com/Flare-Labs/flare-ai/compare/v1.18.0...v1.19.0) (2025-07-28)

### Features

- Add Azure OpenAI provider support with comprehensive testing ([#189](https://github.com/Flare-Labs/flare-ai/issues/189)) ([edad917](https://github.com/Flare-Labs/flare-ai/commit/edad91707d49fcb5d3bd244a77fbaae86527742a)) by @shukyr
- add bot name preference to user settings ([f4aa588](https://github.com/Flare-Labs/flare-ai/commit/f4aa5885d0be06cc21149d09e604c781e551ec4a)) by @Flare-Labs
- **agent:** agent and archive ([#192](https://github.com/Flare-Labs/flare-ai/issues/192)) ([c63ae17](https://github.com/Flare-Labs/flare-ai/commit/c63ae179363b66bfa4f4b5524bdf27b71166c299)) by @Flare-Labs

### Bug Fixes

- enhance event handling for keyboard shortcuts in chat components ([95dad3b](https://github.com/Flare-Labs/flare-ai/commit/95dad3bd1dac4b6e56be2df35957a849617ba056)) by @Flare-Labs
- refine thinking prompt condition in chat API ([0192151](https://github.com/Flare-Labs/flare-ai/commit/0192151fec1e33f3b7bc1f08b0a9582d66650ef0)) by @Flare-Labs

## [1.18.0](https://github.com/Flare-Labs/flare-ai/compare/v1.17.1...v1.18.0) (2025-07-24)

### Features

- add sequential thinking tool and enhance UI components ([#183](https://github.com/Flare-Labs/flare-ai/issues/183)) ([5bcbde2](https://github.com/Flare-Labs/flare-ai/commit/5bcbde2de776b17c3cc1f47f4968b13e22fc65b2)) by @Flare-Labs

## [1.17.1](https://github.com/Flare-Labs/flare-ai/compare/v1.17.0...v1.17.1) (2025-07-23)

### Bug Fixes

- ensure thread date fallback to current date in AppSidebarThreads component ([800b504](https://github.com/Flare-Labs/flare-ai/commit/800b50498576cfe1717da4385e2a496ac33ea0ad)) by @Flare-Labs
- link to the config generator correctly ([#184](https://github.com/Flare-Labs/flare-ai/issues/184)) ([1865ecc](https://github.com/Flare-Labs/flare-ai/commit/1865ecc269e567838bc391a3236fcce82c213fc0)) by @brrock
- python executor ([ea58742](https://github.com/Flare-Labs/flare-ai/commit/ea58742cccd5490844b3139a37171b1b68046f85)) by @Flare-Labs

## [1.17.0](https://github.com/Flare-Labs/flare-ai/compare/v1.16.0...v1.17.0) (2025-07-18)

### Features

- add Python execution tool and integrate Pyodide support ([#176](https://github.com/Flare-Labs/flare-ai/issues/176)) ([de2cf7b](https://github.com/Flare-Labs/flare-ai/commit/de2cf7b66444fe64791ed142216277a5f2cdc551)) by @Flare-Labs

### Bug Fixes

- generate title by user message ([9ee4be6](https://github.com/Flare-Labs/flare-ai/commit/9ee4be69c6b90f44134d110e90f9c3da5219c79f)) by @Flare-Labs
- generate title sync ([5f3afdc](https://github.com/Flare-Labs/flare-ai/commit/5f3afdc4cb7304460606b3480f54f513ef24940c)) by @Flare-Labs

## [1.16.0](https://github.com/Flare-Labs/flare-ai/compare/v1.15.0...v1.16.0) (2025-07-15)

### Features

- Lazy Chat Title Generation: Save Empty Title First, Then Generate and Upsert in Parallel ([#162](https://github.com/Flare-Labs/flare-ai/issues/162)) ([31dfd78](https://github.com/Flare-Labs/flare-ai/commit/31dfd7802e33d8d4e91aae321c3d16a07fe42552)) by @Flare-Labs
- publish container to GitHub registry ([#149](https://github.com/Flare-Labs/flare-ai/issues/149)) ([9f03cbc](https://github.com/Flare-Labs/flare-ai/commit/9f03cbc1d2890746f14919ebaad60f773b0a333d)) by @codingjoe
- update mention ux ([#161](https://github.com/Flare-Labs/flare-ai/issues/161)) ([7ceb9c6](https://github.com/Flare-Labs/flare-ai/commit/7ceb9c69c32de25d523a4d14623b25a34ffb3c9d)) by @Flare-Labs

### Bug Fixes

- bug(LineChart): series are incorrectly represented [#165](https://github.com/Flare-Labs/flare-ai/issues/165) ([4e4905c](https://github.com/Flare-Labs/flare-ai/commit/4e4905c0f7f6a3eca73ea2ac06f718fa29b0f821)) by @Flare-Labs
- ignore tool binding on unsupported models (server-side) ([#160](https://github.com/Flare-Labs/flare-ai/issues/160)) ([277b4fe](https://github.com/Flare-Labs/flare-ai/commit/277b4fe986d5b6d9780d9ade83f294d8f34806f6)) by @Flare-Labs
- js executor tool and gemini model version ([#169](https://github.com/Flare-Labs/flare-ai/issues/169)) ([e25e10a](https://github.com/Flare-Labs/flare-ai/commit/e25e10ab9fac4247774b0dee7e01d5f6a4b16191)) by @Flare-Labs
- **scripts:** parse openai compatible on windows ([#164](https://github.com/Flare-Labs/flare-ai/issues/164)) ([41f5ff5](https://github.com/Flare-Labs/flare-ai/commit/41f5ff55b8d17c76a23a2abf4a6e4cb0c4d95dc5)) by @axel7083
- **workflow-panel:** fix save button width ([#168](https://github.com/Flare-Labs/flare-ai/issues/168)) ([3e66226](https://github.com/Flare-Labs/flare-ai/commit/3e6622630c9cc40ff3d4357e051c45f8c860fc10)) by @axel7083

## [1.15.0](https://github.com/Flare-Labs/flare-ai/compare/v1.14.1...v1.15.0) (2025-07-11)

### Features

- Add js-execution tool and bug fixes(tool call) ([#148](https://github.com/Flare-Labs/flare-ai/issues/148)) ([12b18a1](https://github.com/Flare-Labs/flare-ai/commit/12b18a1cf31a17e565eddc05764b5bd2d0b0edee)) by @Flare-Labs

### Bug Fixes

- enhance ToolModeDropdown with tooltip updates and debounce functionality ([d06db0b](https://github.com/Flare-Labs/flare-ai/commit/d06db0b3e1db34dc4785eb31ebd888d7c2ae0d64)) by @Flare-Labs

## [1.14.1](https://github.com/Flare-Labs/flare-ai/compare/v1.14.0...v1.14.1) (2025-07-09)

### Bug Fixes

- tool select ui ([#141](https://github.com/Flare-Labs/flare-ai/issues/141)) ([0795524](https://github.com/Flare-Labs/flare-ai/commit/0795524991a7aa3e17990777ca75381e32eaa547)) by @Flare-Labs

## [1.14.0](https://github.com/Flare-Labs/flare-ai/compare/v1.13.0...v1.14.0) (2025-07-07)

### Features

- web-search with images ([bea76b3](https://github.com/Flare-Labs/flare-ai/commit/bea76b3a544d4cf5584fa29e5c509b0aee1d4fee)) by @Flare-Labs
- **workflow:** add auto layout feature for workflow nodes and update UI messages ([0cfbffd](https://github.com/Flare-Labs/flare-ai/commit/0cfbffd631c9ae5c6ed57d47ca5f34b9acbb257d)) by @Flare-Labs
- **workflow:** stable workflow ( add example workflow : baby-research ) ([#137](https://github.com/Flare-Labs/flare-ai/issues/137)) ([c38a7ea](https://github.com/Flare-Labs/flare-ai/commit/c38a7ea748cdb117a4d0f4b886e3d8257a135956)) by @Flare-Labs

### Bug Fixes

- **api:** handle error case in chat route by using orElse for unwrap ([25580a2](https://github.com/Flare-Labs/flare-ai/commit/25580a2a9f6c9fbc4abc29fee362dc4b4f27f9b4)) by @Flare-Labs
- **workflow:** llm structure Output ([c529292](https://github.com/Flare-Labs/flare-ai/commit/c529292ddc1a4b836a5921e25103598afd7e3ab7)) by @Flare-Labs

## [1.13.0](https://github.com/Flare-Labs/flare-ai/compare/v1.12.1...v1.13.0) (2025-07-04)

### Features

- Add web search and content extraction tools using Tavily API ([#126](https://github.com/Flare-Labs/flare-ai/issues/126)) ([f7b4ea5](https://github.com/Flare-Labs/flare-ai/commit/f7b4ea5828b33756a83dd881b9afa825796bf69f)) by @raunak-bot

### Bug Fixes

- workflow condition node issue ([78b7add](https://github.com/Flare-Labs/flare-ai/commit/78b7addbba51b4553ec5d0ce8961bf90be5d649c)) by @Flare-Labs
- **workflow:** improve mention handling by ensuring empty values are represented correctly ([92ff9c3](https://github.com/Flare-Labs/flare-ai/commit/92ff9c3e14b97d9f58a22f9df2559e479f14537c)) by @Flare-Labs
- **workflow:** simplify mention formatting by removing bold styling for non-empty values ([ef65fd7](https://github.com/Flare-Labs/flare-ai/commit/ef65fd713ab59c7d8464cae480df7626daeff5cd)) by @Flare-Labs

## [1.12.1](https://github.com/Flare-Labs/flare-ai/compare/v1.12.0...v1.12.1) (2025-07-02)

### Bug Fixes

- **workflow:** enhance structured output handling and improve user notifications ([dd43de9](https://github.com/Flare-Labs/flare-ai/commit/dd43de99881d64ca0c557e29033e953bcd4adc0e)) by @Flare-Labs

## [1.12.0](https://github.com/Flare-Labs/flare-ai/compare/v1.11.0...v1.12.0) (2025-07-01)

### Features

- **chat:** enable [@mention](https://github.com/mention) and tool click to trigger workflow execution in chat ([#122](https://github.com/Flare-Labs/flare-ai/issues/122)) ([b4e7f02](https://github.com/Flare-Labs/flare-ai/commit/b4e7f022fa155ef70be2aee9228a4d1d2643bf10)) by @raunak-bot

### Bug Fixes

- clean changlelog and stop duplicate attributions in the changelog file ([#119](https://github.com/Flare-Labs/flare-ai/issues/119)) ([aa970b6](https://github.com/Flare-Labs/flare-ai/commit/aa970b6a2d39ac1f0ca22db761dd452e3c7a5542)) by @brrock

## [1.11.0](https://github.com/Flare-Labs/flare-ai/compare/v1.10.0...v1.11.0) (2025-06-28)

### Features

- **workflow:** Add HTTP and Template nodes with LLM structured output supportWorkflow node ([#117](https://github.com/Flare-Labs/flare-ai/issues/117)) ([10ec438](https://github.com/Flare-Labs/flare-ai/commit/10ec438f13849f0745e7fab652cdd7cef8e97ab6)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot
- **workflow:** add HTTP node configuration and execution support ([7d2f65f](https://github.com/Flare-Labs/flare-ai/commit/7d2f65fe4f0fdaae58ca2a69abb04abee3111c60)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

### Bug Fixes

- add POST endpoint for MCP client saving with session validation ([fa005aa](https://github.com/Flare-Labs/flare-ai/commit/fa005aaecbf1f8d9279f5b4ce5ba85343e18202b)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- split theme system into base themes and style variants ([61ebd07](https://github.com/Flare-Labs/flare-ai/commit/61ebd0745bcfd7a84ba3ad65c3f52b7050b5131a)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- update ToolMessagePart to use isExecuting state instead of isExpanded ([752f8f0](https://github.com/Flare-Labs/flare-ai/commit/752f8f06e319119569e9ee7c04d621ab1c43ca54)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

## [1.10.0](https://github.com/Flare-Labs/flare-ai/compare/v1.9.0...v1.10.0) (2025-06-27)

### Features

- **releases:** add debug logging to the add authors and update release step ([#105](https://github.com/Flare-Labs/flare-ai/issues/105)) ([c855a6a](https://github.com/Flare-Labs/flare-ai/commit/c855a6a94c49dfd93c9a8d1d0932aeda36bd6c7e)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- workflow beta ([#100](https://github.com/Flare-Labs/flare-ai/issues/100)) ([2f5ada2](https://github.com/Flare-Labs/flare-ai/commit/2f5ada2a66e8e3cd249094be9d28983e4331d3a1)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot

### Bug Fixes

- update tool selection logic in McpServerSelector to maintain current selections ([4103c1b](https://github.com/Flare-Labs/flare-ai/commit/4103c1b828c3e5b513679a3fb9d72bd37301f99d)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- **workflow:** MPC Tool Response Structure And Workflow ([#113](https://github.com/Flare-Labs/flare-ai/issues/113)) ([836ffd7](https://github.com/Flare-Labs/flare-ai/commit/836ffd7ef5858210bdce44d18ca82a1c8f0fc87f)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot

## [1.9.0](https://github.com/Flare-Labs/flare-ai/compare/v1.8.0...v1.9.0) (2025-06-16)

### Features

- credit contributors in releases and changlogs ([#104](https://github.com/Flare-Labs/flare-ai/issues/104)) ([e0e4443](https://github.com/Flare-Labs/flare-ai/commit/e0e444382209a36f03b6e898f26ebd805032c306)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- increase maxTokens for title generation in chat actions issue [#102](https://github.com/Flare-Labs/flare-ai/issues/102) ([bea2588](https://github.com/Flare-Labs/flare-ai/commit/bea2588e24cf649133e8ce5f3b6391265b604f06)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- temporary chat initial model ([0393f7a](https://github.com/Flare-Labs/flare-ai/commit/0393f7a190463faf58cbfbca1c21d349a9ff05dc)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- update adding-openAI-like-providers.md ([#101](https://github.com/Flare-Labs/flare-ai/issues/101)) ([2bb94e7](https://github.com/Flare-Labs/flare-ai/commit/2bb94e7df63a105e33c1d51271751c7b89fead23)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock
- update config file path in release workflow ([7209cbe](https://github.com/Flare-Labs/flare-ai/commit/7209cbeb89bd65b14aee66a40ed1abb5c5f2e018)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

## [1.8.0](https://github.com/Flare-Labs/flare-ai/compare/v1.7.0...v1.8.0) (2025-06-11)

### Features

- add openAI compatible provider support ([#92](https://github.com/Flare-Labs/flare-ai/issues/92)) ([6682c9a](https://github.com/Flare-Labs/flare-ai/commit/6682c9a320aff9d91912489661d27ae9bb0f4440)) by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock by @brrock

### Bug Fixes

- Enhance component styles and configurations ([a7284f1](https://github.com/Flare-Labs/flare-ai/commit/a7284f12ca02ee29f7da4d57e4fe6e8c6ecb2dfc)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

## [1.7.0](https://github.com/Flare-Labs/flare-ai/compare/v1.6.2...v1.7.0) (2025-06-06)

### Features

- Per User Custom instructions ([#86](https://github.com/Flare-Labs/flare-ai/issues/86)) ([d45c968](https://github.com/Flare-Labs/flare-ai/commit/d45c9684adfb0d9b163c83f3bb63310eef572279)) by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu by @vineetu

## [1.6.2](https://github.com/Flare-Labs/flare-ai/compare/v1.6.1...v1.6.2) (2025-06-04)

### Bug Fixes

- enhance error handling in chat bot component ([1519799](https://github.com/Flare-Labs/flare-ai/commit/15197996ba1f175db002b06e3eac2765cfae1518)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- improve session error handling in authentication ([eb15b55](https://github.com/Flare-Labs/flare-ai/commit/eb15b550facf5368f990d58b4b521bf15aecbf72)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- support OpenAI real-time chat project instructions ([2ebbb5e](https://github.com/Flare-Labs/flare-ai/commit/2ebbb5e68105ef6706340a6cfbcf10b4d481274a)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- unify SSE and streamable config as RemoteConfig ([#85](https://github.com/Flare-Labs/flare-ai/issues/85)) ([66524a0](https://github.com/Flare-Labs/flare-ai/commit/66524a0398bd49230fcdec73130f1eb574e97477)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot

## [1.6.1](https://github.com/Flare-Labs/flare-ai/compare/v1.6.0...v1.6.1) (2025-06-02)

### Bug Fixes

- speech ux ([baa849f](https://github.com/Flare-Labs/flare-ai/commit/baa849ff2b6b147ec685c6847834385652fc3191)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

## [1.6.0](https://github.com/Flare-Labs/flare-ai/compare/v1.5.2...v1.6.0) (2025-06-01)

### Features

- add husky for formatting and checking commits ([#71](https://github.com/Flare-Labs/flare-ai/issues/71)) ([a379cd3](https://github.com/Flare-Labs/flare-ai/commit/a379cd3e869b5caab5bcaf3b03f5607021f988ef)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- add Spanish, French, Japanese, and Chinese language support with UI improvements ([#74](https://github.com/Flare-Labs/flare-ai/issues/74)) ([e34d43d](https://github.com/Flare-Labs/flare-ai/commit/e34d43df78767518f0379a434f8ffb1808b17e17)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot
- implement cold start-like auto connection for MCP server and simplify status ([#73](https://github.com/Flare-Labs/flare-ai/issues/73)) ([987c442](https://github.com/Flare-Labs/flare-ai/commit/987c4425504d6772e0aefe08b4e1911e4cb285c1)) by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot by @raunak-bot

## [1.5.2](https://github.com/Flare-Labs/flare-ai/compare/v1.5.1...v1.5.2) (2025-06-01)

### Features

- Add support for Streamable HTTP Transport [#56](https://github.com/Flare-Labs/flare-ai/issues/56) ([8783943](https://github.com/Flare-Labs/flare-ai/commit/878394337e3b490ec2d17bcc302f38c695108d73)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- implement speech system prompt and update voice chat options for enhanced user interaction ([5a33626](https://github.com/Flare-Labs/flare-ai/commit/5a336260899ab542407c3c26925a147c1a9bba11)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- update MCP server UI and translations for improved user experience ([1e2fd31](https://github.com/Flare-Labs/flare-ai/commit/1e2fd31f8804669fbcf55a4c54ccf0194a7e797c)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

### Bug Fixes

- enhance mobile UI experience with responsive design adjustments ([2eee8ba](https://github.com/Flare-Labs/flare-ai/commit/2eee8bab078207841f4d30ce7708885c7268302e)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs
- UI improvements for mobile experience ([#66](https://github.com/Flare-Labs/flare-ai/issues/66)) ([b4349ab](https://github.com/Flare-Labs/flare-ai/commit/b4349abf75de69f65a44735de2e0988c6d9d42d8)) by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs by @Flare-Labs

### Miscellaneous Chores

- release 1.5.2 ([d185514](https://github.com/Flare-Labs/flare-ai/commit/d1855148cfa53ea99c9639f8856d0e7c58eca020)) by @Flare-Labs
