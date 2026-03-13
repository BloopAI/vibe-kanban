---
title: "Разбор useConversationHistory"
description: "Подробное внутреннее объяснение хука useConversationHistory: что он делает, как работал раньше и какие lifecycle-изменения были внесены в исправлении conversation."
---

# Подробный разбор `useConversationHistory`

Этот документ подробно объясняет файл `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts`.

Цель документа - не пересказать весь чат целиком, а аккуратно разобрать именно этот хук, потому что он является одной из центральных частей conversation pipeline и его основная логика была сознательно сохранена во время последнего фикса.

## Что вообще делает этот хук

`useConversationHistory` - это адаптер между execution processes и UI conversation.

Он не получает на вход готовый список чат-сообщений. Вместо этого он:

1. берет execution processes из `useExecutionProcessesContext()`;
2. для завершенных процессов подгружает историю логов;
3. для running-процессов открывает live stream;
4. преобразует все это в нормализованные conversation entries;
5. эмитит эти entries наружу через `onEntriesUpdated`.

Если упростить до одной схемы, то путь данных такой:

```text
execution processes
-> historical/live process logs
-> normalized conversation entries
-> UI conversation list
```

## Из каких слоев состоит хук

Внутри хука есть четыре главных слоя.

## 1. Входной слой

В начале хука мы читаем:

- `executionProcessesRaw`
- `isLoading`
- `isConnected`

из `useExecutionProcessesContext()`.

Здесь очень важно различать два флага:

- `isLoading` означает: execution-process stream еще не получил initial snapshot;
- `isConnected` означает: websocket сейчас подключен.

Это не одно и то же.

`isLoading` отвечает за начальную готовность данных.
`isConnected` отвечает за текущее состояние транспорта.

## 2. Внутреннее состояние conversation

Дальше хук держит набор `ref`-ов, которые являются его внутренней state machine для текущего conversation scope.

- `executionProcesses.current`
  - отфильтрованный список процессов, которые действительно участвуют в conversation;
- `displayedExecutionProcesses.current`
  - локальное хранилище процессов, для которых entries уже загружены или частично видны;
- `loadedInitialEntries.current`
  - guard, который не дает initial load выполниться повторно для текущего scope;
- `emittedEmptyInitialRef.current`
  - guard, который не дает много раз эмитить пустое initial state;
- `streamingProcessIdsRef.current`
  - множество process id, для которых live stream уже открыт;
- `previousStatusMapRef.current`
  - карта предыдущих статусов процессов, чтобы ловить переходы вида `running -> finished`;
- `scriptOutputCacheRef.current`
  - кеш склеенного script output, чтобы не собирать большие строки заново на каждый emit.

Это очень важный момент: хук stateful не только через React state, но и через refs. И большая часть бага была не в трансформации данных, а в том, когда эти refs сбрасываются и каким ключом управляется этот сброс.

## 3. UI-флаги, которые возвращает хук

Хук возвращает наружу не только entries, но и несколько вспомогательных флагов:

- `hasSetupScriptRun`
- `hasCleanupScriptRun`
- `hasRunningProcess`
- `isFirstTurn`

Это не сами conversation entries. Это metadata для UI-обвязки: плейсхолдеров, footer-логики и понимания, находится ли conversation еще на первом coding turn.

## 4. Построение и эмит conversation entries

Главная логика построения данных находится в двух функциях:

- `flattenEntriesForEmit(...)`
- `emitEntries(...)`

Именно здесь локальное хранилище процессов превращается в плоский массив `PatchTypeWithKey[]`, который дальше уже может рендериться conversation UI.

## Важные helper-функции и зачем они нужны

## `extractPromptFromActionChain(...)`

Эта функция проходит по `next_action` chain и ищет первый реальный coding prompt.

Она нужна для setup-script сценария. Когда есть setup script, initial user message показывается не сразу из coding-agent branch, а после завершения setup script. Чтобы достать правильный prompt, используется именно эта функция.

## `patchWithKey(...)`

Эта функция оборачивает любой patch дополнительными полями:

- `patchKey`
- `executionProcessId`

Это нужно для стабильной идентичности в UI: группировки, ключей React, виртуализации и связи entry с конкретным execution process.

## `flattenEntries(...)`

Это маленький helper, который нужен не для финального рендера, а для initial-loading логики.

Он берет локальный store процессов, оставляет только coding/review branches, сортирует их и флеттенит entries в один список.

Его основная роль - понять, набрали ли мы уже достаточное количество initial entries во время первой исторической подгрузки.

## `mergeIntoDisplayed(...)`

Это тонкая обертка над `displayedExecutionProcesses.current`.

Смысл в том, что для этого хука `displayedExecutionProcesses.current` - основной локальный store conversation branches, и он мутируется инкрементально по мере прихода history и live updates.

## Главное ядро: как строятся conversation entries

## `flattenEntriesForEmit(...)`

Это сердце всего хука.

Именно здесь происходит преобразование локального process store в единый список conversation entries.

Функция делает сразу несколько вещей:

- сортирует процессы по времени создания;
- строит synthetic user messages для coding/review requests;
- убирает дубликаты `user_message` из process logs, потому что user message уже строится вручную;
- вырезает `token_usage_info` из видимого conversation и отдельно кладет его в context;
- определяет, есть ли pending approval;
- определяет, есть ли running process;
- добавляет synthetic loading entry для running coding-agent processes;
- превращает setup/cleanup/archive/tool-install scripts в synthetic tool-use entries;
- после завершения setup script добавляет initial user prompt;
- в конце, если нет running process и нет pending approval, добавляет `nextActionPatch(...)`.

Очень важный момент: эта логика во время последнего фикса специально не переписывалась.

То есть:

- semantics построения conversation остались прежними;
- менялся lifecycle вокруг этой логики.

## `emitEntries(...)`

Эта функция - граница между хуком и внешним container-ом.

Она:

1. вызывает `flattenEntriesForEmit(...)`;
2. проверяет, не является ли последняя entry `ExitPlanMode`;
3. если да, меняет `addType` на `'plan'`;
4. вызывает `onEntriesUpdatedRef.current?.(...)`.

Семантически эта часть тоже не менялась.

## Как работает historical и live loading

## Историческая подгрузка завершенного процесса

`loadEntriesForHistoricExecutionProcess(...)` выбирает endpoint по типу процесса:

- для script processes - raw logs;
- для coding/review processes - normalized logs.

Функция резолвится всеми entries после завершения стрима, а в случае ошибки возвращает `[]`.

## Live stream для running process

`loadRunningAndEmit(...)` открывает live stream для running process.

Когда entries приходят:

- они оборачиваются через `patchWithKey(...)`;
- кладутся в `displayedExecutionProcesses.current`;
- сразу эмитятся через `emitEntries(..., 'running', false)`.

`loadRunningAndEmitWithBackoff(...)` добавляет retry-обертку, потому что стрим процесса иногда стартует не мгновенно.

## Initial history loading

`loadInitialEntries(...)` загружает ограниченную стартовую часть истории завершенных процессов.

Он идет по процессам от новых к старым, пропускает running-процессы и останавливается, когда количество флеттененных conversation entries превышает `MIN_INITIAL_ENTRIES`.

Идея здесь такая:

- быстро показать conversation пользователю;
- не ждать загрузки всей истории;
- остальную историю добрать позже батчами.

## Remaining history backfill

`loadRemainingEntriesInBatches(...)` продолжает догружать старую историю уже после того, как initial view появился.

Это performance trade-off:

- быстрый first paint;
- постепенный backfill полной истории после него.

## Как этот хук работал раньше

До фикса lifecycle хука фактически был завязан на `attempt.id`.

То есть conversation внутри этого хука воспринимался в основном как workspace-scoped сущность.

Проблема в том, что execution-process stream на самом деле session-scoped.

Получалась рассинхронизация:

- upstream stream жил на уровне session;
- а reset/load lifecycle этого хука жил на уровне workspace.

Это была первая архитектурная проблема.

## Старый initial-load effect

В старой версии initial-load effect:

- зависел от `attempt.id` и `idListKey`;
- сразу выходил, если `executionProcesses.current.length === 0`;
- сразу выходил, если `loadedInitialEntries.current === true`;
- иначе грузил initial history;
- и только после завершения ставил `loadedInitialEntries.current = true`.

Это хорошо видно в `packages/web-core/src/shared/hooks/useConversationHistory/useConversationHistoryOld.ts:540`.

## Старый reset effect

Отдельно внизу файла был reset effect, тоже привязанный к `attempt.id`.

Он:

- очищал `displayedExecutionProcesses.current`;
- ставил `loadedInitialEntries.current = false`;
- очищал `streamingProcessIdsRef.current`;
- эмитил `emitEntries(..., 'initial', true)`.

Это видно в `packages/web-core/src/shared/hooks/useConversationHistory/useConversationHistoryOld.ts:634`.

## Почему это было опасно

React выполняет `useEffect` внутри компонента в порядке объявления.

А значит в старом коде происходило следующее:

1. initial-load effect был объявлен раньше;
2. reset effect был объявлен позже;
3. оба зависели от одного и того же identity key;
4. при смене scope сначала мог отработать initial-load effect и увидеть старое ref-состояние;
5. затем reset effect очищал все после него.

В худшем случае это приводило к такому состоянию:

- локальный conversation store уже очищен;
- новый initial load так и не стартовал;
- UI conversation оставался пустым.

Это и был главный lifecycle bug.

## Что именно было изменено

Последний фикс меняет lifecycle и conversation identity. Он не переписывает data model.

## 1. Добавлен явный `scopeKey`

В `packages/web-core/src/shared/hooks/useConversationHistory/types.ts` в параметры хука было добавлено поле:

```ts
scopeKey: string;
```

Смысл этого изменения:

- хук больше не должен сам догадываться, что считать identity conversation;
- parent явно передает ключ текущего conversation scope;
- на практике этот scope теперь строится как `workspace + session`, а не просто workspace.

Это structural fix.

## 2. Внутри хука lifecycle больше не управляется через `attempt.id`

Сейчас `useConversationHistory` внутри реально использует:

- `onEntriesUpdated`
- `scopeKey`

а `attempt` больше не используется для reset/load identity.

Это означает, что lifecycle хука отвязан от workspace id и переведен на explicit conversation scope.

## 3. Reset теперь выполняется раньше initial load

Новый reset effect начинается в `packages/web-core/src/features/workspace-chat/model/hooks/useConversationHistory.ts:710`.

Он делает полный сброс conversation-local состояния:

- очищает `displayedExecutionProcesses.current`;
- сбрасывает `loadedInitialEntries.current`;
- сбрасывает `emittedEmptyInitialRef.current`;
- очищает `streamingProcessIdsRef.current`;
- очищает `previousStatusMapRef.current`;
- очищает `scriptOutputCacheRef.current`;
- сбрасывает `hasSetupScriptRun`;
- сбрасывает `hasCleanupScriptRun`;
- сбрасывает `hasRunningProcess`;
- эмитит `emitEntries(..., 'initial', true)`.

Это очень важное изменение, потому что теперь новый conversation scope всегда сначала входит в чистое loading-state, и только потом initial-load effect решает, что делать дальше.

## 4. Initial load теперь ждет готовности execution-process stream

В новом initial-load effect появилась ключевая строка:

```ts
if (isLoading) return;
```

Это одно из самых важных изменений во всем фиксе.

Раньше пустой список процессов мог означать две вещи:

- session действительно пустая;
- или execution-process stream просто еще не получил initial snapshot.

Теперь хук сначала дожидается `isLoading === false`, и только после этого решает, действительно ли conversation пустая.

Это устраняет ложные empty-state выводы.

## 5. Пустой conversation теперь считается корректно завершенным initial state

Если после инициализации стрима процессов нет, выполняется ветка:

```ts
if (executionProcesses.current.length === 0) {
  if (emittedEmptyInitialRef.current) return;
  emittedEmptyInitialRef.current = true;
  loadedInitialEntries.current = true;
  emitEntries(displayedExecutionProcesses.current, "initial", false);
  return;
}
```

Здесь есть два важных смысловых изменения.

Первое:

- действительно пустой conversation больше не считается "все еще грузящимся";
- он считается валидным завершенным initial state.

Второе:

- даже для пустого случая ставится `loadedInitialEntries.current = true`;
- то есть пустой conversation теперь тоже считается уже инициализированным scope.

Именно это не дает хуку застревать в подвешенном промежуточном состоянии.

## 6. `loadedInitialEntries.current` теперь выставляется до начала async initial load

Если процессы есть, хук теперь делает:

```ts
loadedInitialEntries.current = true;
```

еще до `await loadInitialEntries()`.

Раньше это происходило только после завершения загрузки.

Новая семантика лучше, потому что этот флаг теперь работает как lock:

- initial load для текущего scope уже захвачен;
- второй initial load параллельно стартовать не должен.

То есть теперь флаг означает не только "initial load завершился", но и "initial load уже начат и принадлежит текущему scope".

Это subtle, но очень важное lifecycle-улучшение.

## 7. Effects, которые раньше зависели от `attempt.id`, переведены на `scopeKey`

Это касается:

- initial load effect;
- active-process streaming effect;
- removed-process cleanup effect.

Теперь все эти части реагируют не на workspace identity, а на реальную identity conversation.

## 8. Старый нижний reset effect был удален

Это важно не только потому, что он был лишним. Важно, что он был неправильно расположен относительно initial-load effect.

Теперь порядок такой:

1. сбросить весь conversation-local state;
2. объявить loading state;
3. дождаться готовности execution-process stream;
4. решить, conversation пустая или нужно грузить историю;
5. продолжить со streaming и backfill.

Это уже deterministic lifecycle.

## Что специально не менялось

Это не менее важно, чем список изменений.

Во время фикса были сознательно сохранены:

- `flattenEntriesForEmit(...)`;
- логика synthetic user message;
- setup-script special flow;
- extraction token usage info;
- detection pending approvals;
- emission loading patch;
- emission next action patch;
- live streaming running processes;
- batched historical loading;
- reload процесса после перехода `running -> finished`.

То есть:

- сам способ сборки conversation остался прежним;
- изменилось только то, когда и под каким identity-key этот процесс запускается.

## До и после в виде упрощенного pseudocode

## До

```text
effect load(attempt.id):
  if loadedInitialEntries -> return
  if executionProcesses.length === 0 -> return or emit empty
  load initial entries
  loadedInitialEntries = true

effect reset(attempt.id):
  clear state
  loadedInitialEntries = false
  emit loading=true
```

Основные проблемы:

- load мог выполниться раньше reset;
- смена session внутри одного workspace описывалась недостаточно точно;
- временная пустота стрима могла приниматься за реальную пустоту conversation.

## После

```text
effect reset(scopeKey):
  clear all conversation-local refs and flags
  emit loading=true

effect load(scopeKey, isLoading):
  if already initialised -> return
  if process stream is still initialising -> return
  if no processes:
    mark initialised
    emit empty, loading=false
    return
  mark initialised
  load initial history
  emit initial result
  backfill remaining history
```

Это уже правильная форма state machine для этого хука.

## Почему новая версия архитектурно корректнее

Фикс четко разделяет три состояния, которые раньше частично смешивались:

1. execution-process stream еще не инициализирован;
2. conversation действительно пустая;
3. conversation содержит историю и нужно запускать initial load.

Плюс хук переведен с implicit workspace identity на explicit conversation scope identity.

Именно в этом главный смысл нового варианта:

- логика преобразования данных уже была в основном хорошей;
- lifecycle orchestration была хрупкой;
- фикс сделал lifecycle детерминированным.

## Последняя важная деталь

Сейчас в shared type `UseConversationHistoryParams` поле `attempt` еще осталось.

Но сам hook больше не использует `attempt` для lifecycle.

Это не behavioral bug, а просто остаток формы API.

Смысловой итог здесь такой:

- раньше hook зависел от `attempt.id`, чтобы понять, что conversation поменялся;
- теперь hook зависит от explicit `scopeKey`.

## Итог в одной фразе

Если свести весь фикс к одной мысли, то она такая:

Хук и раньше хорошо превращал process data в conversation entries, но был слишком хрупким в reset/re-initialisation lifecycle; фикс сохранил логику построения entries и сделал lifecycle session-aware, упорядоченным и детерминированным.
