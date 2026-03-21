import 'package:flutter/material.dart';

class KanbanDrawer extends StatelessWidget {
  const KanbanDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      backgroundColor: const Color(0xFFEEF1F3),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.only(
          topRight: Radius.circular(48),
          bottomRight: Radius.circular(48),
        ),
      ),
      child: Column(
        children: [
          const SizedBox(height: 64),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 24,
                  backgroundColor: Colors.white,
                  backgroundImage: NetworkImage(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuC8Cbz57K8NjK6DfXcPkP2g86Z4gnfzTvuuZRx5iYeIv_pkAM0cTp6OkX50n-MEzQPXp23pTnLB5wtRplSXRwuMz-GvVReAwqkjn9-ynVJg50w0m2gGxWmiH7a02LCuY8MG2cC_EoFQz_Duw6es1D6oH-f-I9TpBFvaWX9HQHULOH8KoV3_vZ4a24k2CdUARbwWg8uibVZYNJUa1vT7Pii-LlqJLWU5twPreYoFGMQlXqsishQIeSGvN644hhM9jhOVt6Lqi9tffQia',
                  ),
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Creative Snowball',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Text(
                      'Pro Plan',
                      style: TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          _buildNavItem(
            context,
            icon: Icons.dashboard,
            label: 'My Boards',
            isSelected: true,
          ),
          _buildNavItem(context, icon: Icons.group, label: 'Team Space'),
          _buildNavItem(context, icon: Icons.inventory_2, label: 'Archive'),
          _buildNavItem(context, icon: Icons.settings, label: 'Settings'),
          const Spacer(),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: const [
                      Text(
                        'STORAGE',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey,
                        ),
                      ),
                      Text(
                        '85%',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0091FF),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: const LinearProgressIndicator(
                      value: 0.85,
                      minHeight: 6,
                      backgroundColor: Color(0xFFE2E8F0),
                      valueColor: AlwaysStoppedAnimation<Color>(
                        Color(0xFF0091FF),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    bool isSelected = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        leading: Icon(
          icon,
          color: isSelected ? Colors.white : Colors.grey.shade600,
        ),
        title: Text(
          label,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 14,
            color: isSelected ? Colors.white : Colors.grey.shade600,
          ),
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(100)),
        tileColor: isSelected ? null : Colors.transparent,
        onTap: () {},
        dense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
        // Gradient for selected item
        visualDensity: VisualDensity.compact,
        // Wrap with Container to apply gradient if selected
      ),
    );
  }
}
