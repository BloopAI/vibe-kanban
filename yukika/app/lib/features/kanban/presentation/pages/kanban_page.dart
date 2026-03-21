import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../domain/entities/kanban_column.dart';
import '../../domain/entities/task.dart';
import '../widgets/kanban_column_widget.dart';
import '../widgets/kanban_drawer.dart';

class KanbanPage extends StatelessWidget {
  const KanbanPage({super.key});

  @override
  Widget build(BuildContext context) {
    final columns = _getSampleData();

    return Scaffold(
      drawer: const KanbanDrawer(),
      body: SafeArea(
        child: Column(
          children: [
            // Board Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Builder(
                        builder: (context) => IconButton(
                          onPressed: () => Scaffold.of(context).openDrawer(),
                          icon: const Icon(
                            Icons.menu,
                            color: Color(0xFF0091FF),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'Yukika',
                        style: TextStyle(
                          fontFamily: 'Plus Jakarta Sans',
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0091FF),
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      IconButton(
                        onPressed: () {},
                        icon: const Icon(Icons.search, color: Colors.grey),
                      ),
                      IconButton(
                        onPressed: () => context.push('/settings'),
                        icon: const Icon(
                          Icons.settings,
                          color: Color(0xFF0091FF),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Board Title & Filter
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Production Board',
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      const Text(
                        'Last updated 2 hours ago',
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF1F3),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Row(
                      children: const [
                        Icon(Icons.filter_list, size: 18),
                        SizedBox(width: 8),
                        Text(
                          'Filter',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Kanban Board
            Expanded(
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 8,
                ),
                itemCount: columns.length,
                itemBuilder: (context, index) {
                  return KanbanColumnWidget(
                    column: columns[index],
                    onTaskTap: (id) => context.push('/task-detail/$id'),
                  );
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: Container(
        height: 64,
        width: 64,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
            colors: [Color(0xFF005DA6), Color(0xFF54A3FF)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF005DA6).withValues(alpha: 0.3),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: FloatingActionButton(
          onPressed: () => context.push('/new-task'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          child: const Icon(Icons.add, color: Colors.white, size: 32),
        ),
      ),
    );
  }

  List<KanbanColumnEntity> _getSampleData() {
    return [
      KanbanColumnEntity(
        id: 'todo',
        title: 'To Do',
        colorValue: 0xFF94A3B8,
        tasks: [
          const Task(
            id: '1',
            title: 'Refactor Iceberg Components',
            description:
                'Clean up the legacy frost-engine code to improve rendering speed.',
            category: TaskCategory.coreApp,
            folder: 'yukika-main',
            assigneeAvatarUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuBOS-48Oy1B03nis_ywnn62MNjQitbfVWXw2SHV_7LjBbVJ6xJUJPUENWTPAFzL_k0bBj5-U1jWGmAieV8hNok6iwKBxoJ4KHWzFcboukgK7oPQrWjtT3ESpHqyvKjr3dV0UX5wUhOtjo9_cdnI4gLaNvePQXFPL11iE0JIfC8qJvHvZLi3A-teK68qQT3sQdW3zo3FHU0Jp93IV-KtFcfcM-eS3g814p4LhOiGygY3haYaMPDOAnMKRPbVzTdNMg_iR21X8iXb7Blv',
            categoryIcon: Icons.code,
          ),
          const Task(
            id: '2',
            title: 'Snowflake Animation Path',
            description:
                'Design the delightful physics for the falling snow background effect.',
            category: TaskCategory.uxDesign,
            folder: 'ui-assets',
            assigneeAvatarUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuAX0Wl2Ux0d52f9CJR3bvMALnU6OGOGqtbRNQYNpZy4MNdRVNfjjIk-oR5rbywLbceN9JUdyoZdYx7XdXXElkuCj8yH8YWECxb4pSRgXmEWH2hBpXWH5DA7UQY4DUPvXHWrlBxQSn3r6-ZZFRPmxHOQhqfKp6nSIAfzbaEQKYk5-94-XhcrnpnGaKhpGjRLiPHwNnVreQaINiO5BuCXkk0KzW5Sy457l9YngsUtqPPX_OQs3y1Qju42XyHOhstWUMeLIZXWGyjHWJw2',
            categoryIcon: Icons.brush,
          ),
        ],
      ),
      KanbanColumnEntity(
        id: 'ready',
        title: 'Ready',
        colorValue: 0xFF54A3FF,
        tasks: [
          const Task(
            id: '3',
            title: 'Winter Launch Campaign',
            description:
                'Finalize the assets for the December 1st announcement.',
            category: TaskCategory.marketing,
            folder: 'outreach',
            assigneeAvatarUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuDEl4XETdh0UoIovsPslbo8kxGab1t5AaBbrwr4XVaoqtypeJa8xvWJR4pkTchjQEQQS2YRVxparVEOBDwYgmUOkn7Uv9u2OgIyULT3l0WBJ7AzsC_Iwg8Wdn7o1nI7wt_E_3ACihbD1kJo1Y920Cywec5sRi0Nf-xWaLIg8JE8L5rFMMSfBps-i9_LhIkjNt3aFm0258bJ21bHp9iVUwEfQeZntpWWRq1g8A8NIKJXE0sOKv--9HAAuLf3tuJ6Fwv2Tafu8YQlstqU',
            categoryIcon: Icons.campaign,
          ),
        ],
      ),
      KanbanColumnEntity(
        id: 'wip',
        title: 'WIP',
        colorValue: 0xFF0091FF,
        tasks: [
          const Task(
            id: '4',
            title: 'Cold-Storage Migration',
            description:
                'Moving non-active board data to the glacier-tier server for cost optimization.',
            category: TaskCategory.devOps,
            folder: 'infra-prod',
            assigneeAvatarUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuCd75YbJVzOLSN-gcN4mGi-orJcKODZZf4m2Dg4lQ1IPnZU7tEdroepGNAGO8stgNuwSyiF5VracWEVCPclT7-X6WoHvyDIpseM0raHp7JXf52lXORIvHs-7eLmsA0QIawCTiAUv_omQ_InXtH79-fEPEO1zn1GZVTsqTsSUoozvKQBv6afWpzEyEuzvUiU6l4-7haVpGjIFcsCy4n1quts6z7w60ltzcRBvmo0SowpGXK8fyDEIfGf1LLSY946CWT_N8ROIfXeM5rl',
            categoryIcon: Icons.bolt,
          ),
        ],
      ),
      KanbanColumnEntity(
        id: 'review',
        title: 'Review',
        colorValue: 0xFF4555A8,
        tasks: [
          const Task(
            id: '5',
            title: 'Login Frostbite Glitch',
            description:
                'Users reporting they are unable to sign in from Safari browsers.',
            category: TaskCategory.criticalBug,
            folder: 'auth-service',
            assigneeAvatarUrl:
                'https://lh3.googleusercontent.com/aida-public/AB6AXuBnDc7se9mSJDByw3o04dM4vmhTPUhZHEE7RhRofjOBg1i4lZ6FPVH1ggqyRzEfySmAjt7ou9elcWVDid2r_UD3Ek30-VGEiI8JLCwdc5GblBJO6o2j_XUC7xs8BHMXrsr5ny4Tya0DgVA8j683k5OM5LQyvWoBV346N9xjvWKVm5b7dTJib8hV2ufZZRIV7MwGy5sp9t31I0dMT9vADyYqqHABGcKRtfMXhNnEVodBKK0FTmorjiZo2ZvLva97Rv_4LT3f6y5CXe7Y',
            categoryIcon: Icons.bug_report,
          ),
        ],
      ),
    ];
  }
}
