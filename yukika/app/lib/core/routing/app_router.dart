import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/pages/signin_page.dart';
import '../../features/auth/presentation/pages/signup_page.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/kanban/presentation/pages/kanban_page.dart';
import '../../features/settings/presentation/pages/settings_page.dart';
import '../../features/tasks/presentation/pages/task_detail_page.dart';
import '../../features/tasks/presentation/pages/new_task_page.dart';

final appRouter = GoRouter(
  initialLocation: '/signin',
  routes: [
    GoRoute(path: '/signin', builder: (context, state) => const SignInPage()),
    GoRoute(path: '/signup', builder: (context, state) => const SignUpPage()),
    GoRoute(
      path: '/forgot-password',
      builder: (context, state) => const ForgotPasswordPage(),
    ),
    GoRoute(path: '/kanban', builder: (context, state) => const KanbanPage()),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsPage(),
    ),
    GoRoute(
      path: '/task-detail/:id',
      builder: (context, state) {
        final id = state.pathParameters['id']!;
        return TaskDetailPage(taskId: id);
      },
    ),
    GoRoute(
      path: '/new-task',
      builder: (context, state) => const NewTaskPage(),
    ),
  ],
);
