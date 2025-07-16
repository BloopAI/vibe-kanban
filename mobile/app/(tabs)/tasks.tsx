import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TaskCard from '../../components/TaskCard';
import { MobileTask, TaskStatus } from '../../types';

const mockTasks: MobileTask[] = [
  {
    id: '1',
    title: 'Implement user authentication',
    description: 'Add login/logout functionality with JWT tokens',
    status: 'inprogress',
    projectName: 'E-commerce Platform',
    createdAt: '2024-07-15T10:00:00Z',
  },
  {
    id: '2',
    title: 'Design mobile interface',
    description: 'Create responsive mobile UI components',
    status: 'inreview',
    projectName: 'Vibe Kanban Mobile',
    createdAt: '2024-07-14T14:30:00Z',
  },
  {
    id: '3',
    title: 'Fix responsive layout',
    description: 'Address mobile viewport issues on small screens',
    status: 'done',
    projectName: 'Portfolio Website',
    createdAt: '2024-07-13T09:15:00Z',
  },
  {
    id: '4',
    title: 'Set up CI/CD pipeline',
    description: 'Configure automated testing and deployment',
    status: 'todo',
    projectName: 'E-commerce Platform',
    createdAt: '2024-07-12T16:45:00Z',
  },
];

const filterOptions = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To Do' },
  { key: 'inprogress', label: 'In Progress' },
  { key: 'inreview', label: 'In Review' },
  { key: 'done', label: 'Done' },
];

export default function TasksScreen() {
  const [tasks, setTasks] = useState<MobileTask[]>(mockTasks);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, []);

  const handleTaskPress = (taskId: string) => {
    console.log('Task pressed:', taskId);
  };

  const filteredTasks = selectedFilter === 'all' 
    ? tasks 
    : tasks.filter(task => task.status === selectedFilter);

  const renderTask = ({ item }: { item: MobileTask }) => (
    <TaskCard 
      task={item} 
      onPress={() => handleTaskPress(item.id)} 
    />
  );

  const renderFilterButton = (option: typeof filterOptions[0]) => (
    <TouchableOpacity
      key={option.key}
      style={[
        styles.filterButton,
        selectedFilter === option.key && styles.filterButtonActive
      ]}
      onPress={() => setSelectedFilter(option.key)}
    >
      <Text
        style={[
          styles.filterButtonText,
          selectedFilter === option.key && styles.filterButtonTextActive
        ]}
      >
        {option.label}
      </Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="checkmark-circle-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyTitle}>No Tasks Found</Text>
      <Text style={styles.emptyDescription}>
        {selectedFilter === 'all' 
          ? 'Create your first task to get started'
          : `No tasks with status "${filterOptions.find(f => f.key === selectedFilter)?.label}"`
        }
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tasks</Text>
        <Text style={styles.subtitle}>
          {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          data={filterOptions}
          renderItem={({ item }) => renderFilterButton(item)}
          keyExtractor={(item) => item.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
        />
      </View>

      <FlatList
        data={filteredTasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          filteredTasks.length === 0 ? styles.emptyListContainer : styles.listContainer
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  filterContainer: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterList: {
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    paddingVertical: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    right: 20,
    bottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});