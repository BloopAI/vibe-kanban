import 'task.dart';

class KanbanColumnEntity {
  final String id;
  final String title;
  final List<Task> tasks;
  final int colorValue;

  const KanbanColumnEntity({
    required this.id,
    required this.title,
    required this.tasks,
    required this.colorValue,
  });
}
