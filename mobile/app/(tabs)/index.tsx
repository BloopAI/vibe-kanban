import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import ProjectCard from '../../components/ProjectCard';
import ProjectForm from '../../components/forms/ProjectForm';
import { MobileProject, Project, CreateProject, TaskWithAttemptStatus } from '../../types';
import { projectsApi, tasksApi } from '../../services/api';

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<MobileProject[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const rawProjects = await projectsApi.getAll();
      const projectsWithStats = await Promise.all(
        rawProjects.map(async (project) => {
          try {
            const tasks = await tasksApi.getAll(project.id);
            const completedTasks = tasks.filter(task => task.status === 'done').length;
            const lastUpdated = new Date(project.updated_at);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60));
            
            let lastActivity = '';
            if (diffHours < 1) {
              lastActivity = 'Just now';
            } else if (diffHours < 24) {
              lastActivity = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            } else {
              const diffDays = Math.floor(diffHours / 24);
              lastActivity = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            }

            return {
              id: project.id,
              name: project.name,
              taskCount: tasks.length,
              completedTasks,
              lastActivity,
            };
          } catch (error) {
            console.warn(`Failed to load tasks for project ${project.id}:`, error);
            return {
              id: project.id,
              name: project.name,
              taskCount: 0,
              completedTasks: 0,
              lastActivity: 'Unknown',
            };
          }
        })
      );
      setProjects(projectsWithStats);
    } catch (error) {
      console.error('Failed to load projects:', error);
      Alert.alert('Error', 'Failed to load projects. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadProjects().finally(() => setRefreshing(false));
  }, []);

  const handleProjectPress = (projectId: string) => {
    router.push(`/project/${projectId}`);
  };

  const handleCreateProject = async (data: CreateProject) => {
    try {
      await projectsApi.create(data);
      setShowCreateForm(false);
      await loadProjects();
      Alert.alert('Success', 'Project created successfully!');
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  };

  const renderProject = ({ item }: { item: MobileProject }) => (
    <ProjectCard 
      project={item} 
      onPress={() => handleProjectPress(item.id)} 
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="folder-open-outline" size={64} color="#9ca3af" />
      <Text style={styles.emptyTitle}>No Projects Yet</Text>
      <Text style={styles.emptyDescription}>
        Create your first project to start managing tasks
      </Text>
      <TouchableOpacity 
        style={styles.createButton}
        onPress={() => setShowCreateForm(true)}
      >
        <Ionicons name="add" size={20} color="#ffffff" />
        <Text style={styles.createButtonText}>Create Project</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Welcome back!</Text>
        <Text style={styles.subtitle}>Manage your coding projects</Text>
      </View>

      <FlatList
        data={projects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={
          projects.length === 0 ? styles.emptyListContainer : styles.listContainer
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setShowCreateForm(true)}
      >
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>

      <Modal
        visible={showCreateForm}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateForm(false)}
      >
        <ProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateForm(false)}
        />
      </Modal>
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
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
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
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    marginLeft: 8,
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