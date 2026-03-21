import 'package:flutter/material.dart';

enum TaskCategory { coreApp, uxDesign, marketing, devOps, aiLogic, criticalBug }

class Task {
  final String id;
  final String title;
  final String description;
  final TaskCategory category;
  final String folder;
  final String assigneeAvatarUrl;
  final IconData categoryIcon;

  const Task({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    required this.folder,
    required this.assigneeAvatarUrl,
    required this.categoryIcon,
  });
}
