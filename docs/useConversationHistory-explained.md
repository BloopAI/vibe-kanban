# Подробный разбор хука `useConversationHistory`

## Общая цель хука

Этот хук отвечает за **загрузку и отображение истории разговора** между пользователем и AI-агентом в рабочем пространстве (workspace). Он:

1. Загружает историю выполненных процессов (execution processes)
2. Стримит логи запущенных процессов в реальном времени
3. Преобразует сырые данные в нормализованный формат для UI
4. Отслеживает изменения статусов процессов и перезагружает данные при необходимости

---

## Структуры данных

### Типы (из `types.ts`)

```typescript
// Статическая информация о процессе - НЕ меняется после создания
type ExecutionProcessStaticInfo = {
  id: string;
  created_at: string;
  updated_at: string;
  executor_action: ExecutorAction;  // Что запускали (запрос к агенту, скрипт и т.д.)
};

// Состояние одного процесса = статическая инфа + записи (entries)
type ExecutionProcessState = {
  executionProcess: ExecutionProcessStaticInfo;
  entries: PatchTypeWithKey[];  // Записи разговора (сообщения, tool calls и т.д.)
};

// Хранилище всех процессов: ключ = ID процесса
type ExecutionProcessStateStore = Record<string, ExecutionProcessState>;
```

---

## Разбор кода по частям

### 1. Инициализация и рефы (строки 35-49)

```typescript
const { executionProcessesVisible: executionProcessesRaw } =
  useExecutionProcessesContext();
```
**Получаем "живые" данные о процессах** из контекста. Эти данные приходят через WebSocket и обновляются в реальном времени. Содержат актуальный `status` каждого процесса.

```typescript
const executionProcesses = useRef<ExecutionProcess[]>(executionProcessesRaw);
```
**Локальная копия процессов** в ref. Используется чтобы иметь доступ к актуальным данным внутри колбэков без лишних ре-рендеров.

```typescript
const displayedExecutionProcesses = useRef<ExecutionProcessStateStore>({});
```
**Главное хранилище** - какие процессы мы уже загрузили и показываем. Ключ = ID процесса, значение = статическая инфа + записи разговора.

```typescript
const loadedInitialEntries = useRef(false);
```
**Флаг** - загрузили ли мы начальные записи. Чтобы не загружать повторно.

```typescript
const streamingProcessIdsRef = useRef<Set<string>>(new Set());
```
**Множество ID процессов**, для которых сейчас идёт стриминг логов. Чтобы не запускать стриминг дважды для одного процесса.

```typescript
const previousStatusMapRef = useRef<Map<string, ExecutionProcessStatus>>(
  new Map()
);
```
**Карта для отслеживания предыдущего статуса** каждого процесса. Нужна для детекции перехода `running → stopped`. Подробнее ниже.

---

### 2. Вспомогательные функции

#### `mergeIntoDisplayed` (строки 51-56)
```typescript
const mergeIntoDisplayed = (
  mutator: (state: ExecutionProcessStateStore) => void
) => {
  const state = displayedExecutionProcesses.current;
  mutator(state);
};
```
**Мутирует хранилище** `displayedExecutionProcesses`. Принимает функцию-мутатор, которая изменяет состояние напрямую.

#### `loadEntriesForHistoricExecutionProcess` (строки 71-97)
```typescript
const loadEntriesForHistoricExecutionProcess = (
  executionProcess: ExecutionProcess
) => {
  let url = '';
  if (executionProcess.executor_action.typ.type === 'ScriptRequest') {
    url = `/api/execution-processes/${executionProcess.id}/raw-logs/ws`;
  } else {
    url = `/api/execution-processes/${executionProcess.id}/normalized-logs/ws`;
  }

  return new Promise<PatchType[]>((resolve) => {
    const controller = streamJsonPatchEntries<PatchType>(url, {
      onFinished: (allEntries) => {
        controller.close();
        resolve(allEntries);
      },
      onError: (err) => {
        // ...
        resolve([]);
      },
    });
  });
};
```
**Загружает записи для ЗАВЕРШЁННОГО процесса** из базы данных через WebSocket. 
- Для скриптов берёт сырые логи (`raw-logs`)
- Для агентов берёт нормализованные логи (`normalized-logs`)
- Возвращает Promise с массивом записей

#### `getLiveExecutionProcess` (строки 99-105)
```typescript
const getLiveExecutionProcess = (
  executionProcessId: string
): ExecutionProcess | undefined => {
  return executionProcesses?.current.find(
    (executionProcess) => executionProcess.id === executionProcessId
  );
};
```
**Находит процесс по ID** в текущем списке "живых" процессов. Используется чтобы получить актуальный статус.

#### `patchWithKey` (строки 107-117)
```typescript
const patchWithKey = (
  patch: PatchType,
  executionProcessId: string,
  index: number | 'user'
) => {
  return {
    ...patch,
    patchKey: `${executionProcessId}:${index}`,
    executionProcessId,
  };
};
```
**Добавляет уникальный ключ** к записи. Ключ = `processId:index`. Нужен для React-рендеринга и идентификации записей.

#### `flattenEntries` (строки 119-139)
```typescript
const flattenEntries = (
  executionProcessState: ExecutionProcessStateStore
): PatchTypeWithKey[] => {
  return Object.values(executionProcessState)
    .filter(/* только агентские запросы, не скрипты */)
    .sort(/* по дате создания */)
    .flatMap((p) => p.entries);
};
```
**Собирает все записи** из всех процессов в один плоский массив, отсортированный по времени.

#### `getActiveAgentProcesses` (строки 141-149)
```typescript
const getActiveAgentProcesses = (): ExecutionProcess[] => {
  return (
    executionProcesses?.current.filter(
      (p) =>
        p.status === ExecutionProcessStatus.running &&
        p.run_reason !== 'devserver'
    ) ?? []
  );
};
```
**Возвращает список запущенных процессов** (кроме dev-сервера).

---

### 3. Главная функция преобразования: `flattenEntriesForEmit` (строки 151-381)

Это **самая сложная функция** в хуке. Она преобразует внутреннее состояние в формат для UI.

```typescript
const flattenEntriesForEmit = useCallback(
  (executionProcessState: ExecutionProcessStateStore): PatchTypeWithKey[] => {
    // Флаги для определения что показывать
    let hasPendingApproval = false;      // Есть ожидающий одобрения tool?
    let hasRunningProcess = false;        // Есть запущенный процесс?
    let lastProcessFailedOrKilled = false; // Последний процесс упал?
    let needsSetup = false;               // Нужна установка зависимостей?
    let setupHelpText: string | undefined;
    let latestTokenUsageInfo: TokenUsageInfo | null = null;
```

Далее она проходит по всем процессам и для каждого:

**Для агентских запросов (CodingAgentInitialRequest, FollowUpRequest, ReviewRequest):**
1. Создаёт запись "сообщение пользователя" из промпта
2. Извлекает информацию об использовании токенов
3. Фильтрует записи (убирает дубликаты user message и token usage)
4. Проверяет есть ли pending approval
5. Проверяет запущен ли процесс
6. Если запущен и нет pending approval - добавляет "loading" индикатор

**Для скриптов (SetupScript, CleanupScript):**
1. Создаёт запись типа "tool_use" с выводом скрипта
2. Определяет статус (running/success/failed) по exit code

**В конце:**
```typescript
// Если нет запущенного процесса и нет ожидающего одобрения
if (!hasRunningProcess && !hasPendingApproval) {
  allEntries.push(
    nextActionPatch(lastProcessFailedOrKilled, ...)  // Показываем "что делать дальше"
  );
}
```

---

### 4. Эмиссия записей: `emitEntries` (строки 383-407)

```typescript
const emitEntries = useCallback(
  (
    executionProcessState: ExecutionProcessStateStore,
    addEntryType: AddEntryType,  // 'initial' | 'running' | 'historic' | 'plan'
    loading: boolean
  ) => {
    const entries = flattenEntriesForEmit(executionProcessState);
    // ...
    onEntriesUpdatedRef.current?.(entries, modifiedAddEntryType, loading);
  },
  [flattenEntriesForEmit]
);
```
**Вызывает колбэк** `onEntriesUpdated` (переданный извне) с преобразованными записями.

---

### 5. Стриминг запущенного процесса: `loadRunningAndEmit` (строки 410-445)

```typescript
const loadRunningAndEmit = useCallback(
  (executionProcess: ExecutionProcess): Promise<void> => {
    return new Promise((resolve, reject) => {
      const controller = streamJsonPatchEntries<PatchType>(url, {
        onEntries(entries) {
          // Каждый раз когда приходят новые записи:
          // 1. Обновляем displayedExecutionProcesses
          // 2. Эмитим все записи в UI
          mergeIntoDisplayed((state) => {
            state[executionProcess.id] = {
              executionProcess,
              entries: patchesWithKey,
            };
          });
          emitEntries(displayedExecutionProcesses.current, 'running', false);
        },
        onFinished: () => {
          // Стрим закончился
          emitEntries(displayedExecutionProcesses.current, 'running', false);
          controller.close();
          resolve();
        },
        // ...
      });
    });
  },
  [emitEntries]
);
```
**Стримит логи запущенного процесса** в реальном времени и обновляет UI по мере поступления данных.

---

### 6. Effects (эффекты)

#### Эффект 1: Начальная загрузка (строки 564-602)

```typescript
useEffect(() => {
  let cancelled = false;
  (async () => {
    if (executionProcesses?.current.length === 0 || loadedInitialEntries.current)
      return;

    // 1. Загружаем начальные записи (последние N процессов)
    const allInitialEntries = await loadInitialEntries();
    mergeIntoDisplayed((state) => {
      Object.assign(state, allInitialEntries);
    });
    emitEntries(displayedExecutionProcesses.current, 'initial', false);
    loadedInitialEntries.current = true;

    // 2. Загружаем остальные записи пачками (для ленивой загрузки)
    while (!cancelled && (await loadRemainingEntriesInBatches(REMAINING_BATCH_SIZE))) {
      // ...
    }
    emitEntries(displayedExecutionProcesses.current, 'historic', false);
  })();
  return () => { cancelled = true; };
}, [attempt.id, idListKey, ...]);
```
**Загружает историю** при первом рендере или смене workspace.

#### Эффект 2: Стриминг активных процессов (строки 604-638)

```typescript
useEffect(() => {
  const activeProcesses = getActiveAgentProcesses();
  if (activeProcesses.length === 0) return;

  for (const activeProcess of activeProcesses) {
    // Если процесс ещё не отображается - добавляем
    if (!displayedExecutionProcesses.current[activeProcess.id]) {
      ensureProcessVisible(activeProcess);
      emitEntries(...);
    }

    // Если процесс running и мы ещё не стримим его - начинаем стрим
    if (
      activeProcess.status === ExecutionProcessStatus.running &&
      !streamingProcessIdsRef.current.has(activeProcess.id)
    ) {
      streamingProcessIdsRef.current.add(activeProcess.id);
      loadRunningAndEmitWithBackoff(activeProcess).finally(() => {
        streamingProcessIdsRef.current.delete(activeProcess.id);
      });
    }
  }
}, [attempt.id, idStatusKey, ...]);
```
**Запускает стриминг** для всех активных процессов.

---

### 7. Ключевой эффект: Перезагрузка при остановке процесса (строки 640-686)

Это **ключевой код** для исправления бага с исчезающими логами:

```typescript
useEffect(() => {
  if (!executionProcessesRaw) return;

  const processesToReload: ExecutionProcess[] = [];

  // Проходим по всем "живым" процессам
  for (const process of executionProcessesRaw) {
    // Получаем предыдущий статус из нашей карты
    const previousStatus = previousStatusMapRef.current.get(process.id);
    const currentStatus = process.status;

    // Если процесс БЫЛ running, а теперь НЕ running
    // И этот процесс у нас отображается
    if (
      previousStatus === ExecutionProcessStatus.running &&
      currentStatus !== ExecutionProcessStatus.running &&
      displayedExecutionProcesses.current[process.id]
    ) {
      // Добавляем в список для перезагрузки
      processesToReload.push(process);
    }

    // Сохраняем текущий статус как "предыдущий" для следующей итерации
    previousStatusMapRef.current.set(process.id, currentStatus);
  }

  if (processesToReload.length === 0) return;

  // Перезагружаем записи из БД для остановленных процессов
  (async () => {
    let anyUpdated = false;

    for (const process of processesToReload) {
      // Загружаем записи из базы данных
      const entries = await loadEntriesForHistoricExecutionProcess(process);
      if (entries.length === 0) continue;

      const entriesWithKey = entries.map((e, idx) =>
        patchWithKey(e, process.id, idx)
      );

      // Обновляем хранилище
      mergeIntoDisplayed((state) => {
        state[process.id] = {
          executionProcess: process,
          entries: entriesWithKey,
        };
      });
      anyUpdated = true;
    }

    // Эмитим обновлённые записи
    if (anyUpdated) {
      emitEntries(displayedExecutionProcesses.current, 'running', false);
    }
  })();
}, [idStatusKey, executionProcessesRaw, emitEntries]);
```

#### Почему это нужно?

**Проблема была такая:**
1. Пользователь смотрит на запущенный процесс (логи стримятся)
2. Пользователь нажимает "Stop"
3. Процесс останавливается
4. Логи сохраняются в БД (бэкенд-фикс)
5. **НО** фронтенд не знает, что нужно перезагрузить логи из БД
6. Пользователь переключается на другой workspace
7. `displayedExecutionProcesses` очищается
8. Пользователь возвращается обратно
9. Фронтенд загружает из БД - но данные могли быть неполными

**Решение:**
Отслеживаем момент, когда статус процесса меняется с `running` на что-то другое. В этот момент **принудительно перезагружаем записи из БД**, чтобы получить полные, персистентные данные.

#### Почему нужен отдельный `previousStatusMapRef`?

`displayedExecutionProcesses` хранит `ExecutionProcessStaticInfo`, который **не содержит статус**. Это сделано намеренно - там хранятся только неизменяемые данные.

Статус приходит из `executionProcessesRaw` (живые данные через WebSocket). Чтобы понять, что статус **изменился**, нужно сравнить "было" и "стало". Для этого и нужна карта `previousStatusMapRef`.

---

### 8. Эффект очистки при смене workspace (строки 705-711)

```typescript
useEffect(() => {
  displayedExecutionProcesses.current = {};
  loadedInitialEntries.current = false;
  streamingProcessIdsRef.current.clear();
  previousStatusMapRef.current.clear();  // Очищаем и карту статусов
  emitEntries(displayedExecutionProcesses.current, 'initial', true);
}, [attempt.id, emitEntries]);
```
**Полная очистка** при смене workspace. Сбрасываем всё состояние и начинаем заново.

---

## Общий поток данных

```
┌─────────────────────────────────────────────────────────────────┐
│                    executionProcessesRaw                        │
│              (живые данные через WebSocket)                     │
│         содержит: id, status, created_at, executor_action       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
┌──────────────────┐ ┌───────────┐ ┌──────────────────┐
│ Эффект стриминга │ │ Эффект    │ │ Эффект           │
│ (для running)    │ │ начальной │ │ перезагрузки     │
│                  │ │ загрузки  │ │ (running→stopped)│
└────────┬─────────┘ └─────┬─────┘ └────────┬─────────┘
         │                 │                │
         │    Загружают записи из API/БД    │
         │                 │                │
         ▼                 ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│              displayedExecutionProcesses (ref)                  │
│    { [processId]: { executionProcess, entries[] } }             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
                   flattenEntriesForEmit()
                           │
                           ▼
                    onEntriesUpdated()
                           │
                           ▼
                        UI рендер
```

---

## Резюме

**Ключевые компоненты:**
1. `executionProcessesRaw` - живые данные о процессах (из WebSocket)
2. `displayedExecutionProcesses` - что мы загрузили и показываем (статика + записи)
3. `previousStatusMapRef` - для отслеживания изменений статуса
4. `streamingProcessIdsRef` - для предотвращения дублирования стримов

**Ключевой эффект для фикса:**
Эффект на строках 640-686 детектирует переход `running → stopped` и перезагружает данные из БД, гарантируя что после остановки процесса мы получим полные, персистентные данные.
