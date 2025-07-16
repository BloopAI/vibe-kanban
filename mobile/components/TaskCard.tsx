import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MobileTask } from '../types';

interface TaskCardProps {
  task: MobileTask;
  onPress: () => void;
}

const statusColors = {
  todo: '#6b7280',
  inprogress: '#f59e0b',
  inreview: '#8b5cf6',
  done: '#10b981',
  cancelled: '#ef4444',
};

const statusIcons = {
  todo: 'ellipse-outline',
  inprogress: 'play-circle',
  inreview: 'eye',
  done: 'checkmark-circle',
  cancelled: 'close-circle',
} as const;

const statusLabels = {
  todo: 'To Do',
  inprogress: 'In Progress',
  inreview: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

export default function TaskCard({ task, onPress }: TaskCardProps) {
  const statusColor = statusColors[task.status];
  const statusIcon = statusIcons[task.status];
  const statusLabel = statusLabels[task.status];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Ionicons name={statusIcon} size={12} color="#ffffff" />
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      {task.description && (
        <Text style={styles.description} numberOfLines={3}>
          {task.description}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.projectName}>{task.projectName}</Text>
        <Text style={styles.createdAt}>
          {new Date(task.createdAt).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '500',
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  projectName: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  createdAt: {
    fontSize: 12,
    color: '#9ca3af',
  },
});