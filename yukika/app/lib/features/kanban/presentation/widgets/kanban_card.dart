import 'package:flutter/material.dart';
import '../../domain/entities/task.dart';

class KanbanCard extends StatelessWidget {
  final Task task;
  final VoidCallback onTap;

  const KanbanCard({super.key, required this.task, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildCategoryTag(task.category),
                Icon(task.categoryIcon, color: Colors.grey.shade300, size: 20),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              task.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              task.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundImage: NetworkImage(task.assigneeAvatarUrl),
                ),
                Row(
                  children: [
                    Icon(
                      Icons.folder_outlined,
                      color: Colors.grey.shade400,
                      size: 14,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      task.folder,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade500,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryTag(TaskCategory category) {
    Color color;
    Color bgColor;
    String label;

    switch (category) {
      case TaskCategory.coreApp:
        color = const Color(0xFF0091FF);
        bgColor = const Color(0xFFE3F2FD);
        label = 'Core App';
        break;
      case TaskCategory.uxDesign:
        color = const Color(0xFF4555A8);
        bgColor = const Color(0xFFE8EAF6);
        label = 'UX Design';
        break;
      case TaskCategory.marketing:
        color = const Color(0xFF0091FF);
        bgColor = const Color(0xFFE3F2FD);
        label = 'Marketing';
        break;
      case TaskCategory.devOps:
        color = const Color(0xFF0091FF);
        bgColor = const Color(0xFFE3F2FD);
        label = 'Dev Ops';
        break;
      case TaskCategory.aiLogic:
        color = const Color(0xFF4A5F62);
        bgColor = const Color(0xFFF0F4F4);
        label = 'AI Logic';
        break;
      case TaskCategory.criticalBug:
        color = const Color(0xFFB31B25);
        bgColor = const Color(0xFFFFEBEE);
        label = 'Critical Bug';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w900,
          color: color,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}
