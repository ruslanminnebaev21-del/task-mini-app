task-mini-app/
  app/
    layout.tsx                 # общий layout (фон, контейнер, глобальная обертка)
    globals.css                # глобальные стили
    page.tsx                   # главный экран-меню (Задачник / Спорт)

    tasks/
      page.tsx                 # экран задачника (вынесенный из app/page.tsx)
      layout.tsx               # (опционально) layout только для задачника
      components/
        TaskCard.tsx
        TaskList.tsx
        TaskSections.tsx
        ProjectTabs.tsx
        Modals/
          EditTaskModal.tsx
          DeleteTaskModal.tsx
          CreateProjectModal.tsx
          EditProjectsModal.tsx

    sport/
      page.tsx                 # главный экран спорта
      layout.tsx               # (опционально) layout только для спорта
      components/
        WorkoutCard.tsx
        WorkoutList.tsx
        WorkoutEditor.tsx
        Stats/
          ProgressChart.tsx
          SummaryCards.tsx
      screens/                 # если спорт будет многоэкранный внутри /sport
        Today.tsx
        History.tsx
        Programs.tsx

    api/
      auth/
        route.ts               # как сейчас
      dev-auth/
        route.ts               # как сейчас

      projects/
        route.ts               # как сейчас (для задачника)
      tasks/
        route.ts               # как сейчас

      sport/
        workouts/
          route.ts             # будущий API спорта (тренировки)
        stats/
          route.ts             # будущий API статистики
        exercises/
          route.ts             # будущий справочник упражнений (если нужен)

  lib/
    supabaseAdmin.ts           # как сейчас
    session.ts                 # как сейчас
    telegram.ts                # как сейчас

    shared/
      fetcher.ts               # общий fetch-wrapper (credentials, обработка ошибок)
      date.ts                  # общие форматтеры дат, isoDayFromTs и т.п.
      storage.ts               # если нужно хранить что-то локально (localStorage)
      constants.ts             # константы/enum’ы

    tasks/
      types.ts                 # типы Task/Project
      api.ts                   # функции-запросы к /api/tasks и /api/projects
      mapping.ts               # группировка секций (Сегодня/Завтра/Просрочено)
      validators.ts            # проверки, нормализация данных

    sport/
      types.ts                 # типы: Workout, Exercise, Set, Metric и т.п.
      api.ts                   # функции-запросы к /api/sport/*
      calculations.ts          # расчёты (объём, тоннаж, PR, прогресс)
      validators.ts

  components/
    ui/                        # переиспользуемые UI-кирпичи
      Button.tsx
      Chip.tsx
      Card.tsx
      Modal.tsx
      Segmented.tsx
      Input.tsx
      Skeleton.tsx
    icons/                     # твои иконки (как сейчас)
      index.ts                 # экспорт всех Icon*
    AppShell.tsx               # общий каркас/обертка (если захочешь вынести из page)

  public/
    icons/                     # фавиконы, картинки, etc.

  .env.local
  next.config.ts
  package.json