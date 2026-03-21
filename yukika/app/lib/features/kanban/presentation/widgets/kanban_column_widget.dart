import 'package:flutter/material.dart';
import '../../domain/entities/kanban_column.dart';
import 'kanban_card.dart';

class KanbanColumnWidget extends StatelessWidget {
  final KanbanColumnEntity column;
  final Function(String) onTaskTap;

  const KanbanColumnWidget({
    super.key,
    required this.column,
    required this.onTaskTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 320,
      margin: const EdgeInsets.only(right: 24),
      decoration: BoxDecoration(
        color: const Color(0xFFEEF1F3), // surface-container-low
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: Color(column.colorValue),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      column.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(
                          0xFFD9DDE0,
                        ), // surface-container-highest
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        '${column.tasks.length}',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const Icon(Icons.more_horiz, color: Colors.grey),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.builder(
              itemCount: column.tasks.length,
              itemBuilder: (context, index) {
                final task = column.tasks[index];
                return KanbanCard(task: task, onTap: () => onTaskTap(task.id));
              },
            ),
          ),
        ],
      ),
    );
  }
}
