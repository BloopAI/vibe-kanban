import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class TaskDetailPage extends StatelessWidget {
  final String taskId;
  const TaskDetailPage({super.key, required this.taskId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0091FF)),
        ),
        title: const Text(
          'Yukika',
          style: TextStyle(
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: FontWeight.bold,
            color: Color(0xFF0091FF),
          ),
        ),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.edit, color: Color(0xFF0091FF)),
          ),
        ],
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Section
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _buildChip(
                  context,
                  'Core App',
                  const Color(0xFFC9CFFF),
                  const Color(0xFF304092),
                ),
                _buildChip(
                  context,
                  'WIP',
                  const Color(0xFFDEF5F8),
                  const Color(0xFF495E60),
                  icon: Icons.pending,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Refactor Iceberg Components',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 32),

            // Bento Grid for Details
            // Description
            _buildBentoSection(
              context,
              icon: Icons.subject,
              title: 'Description',
              iconColor: Theme.of(context).colorScheme.primary,
              child: const Text(
                'Clean up the legacy frost-engine code to improve rendering speed and ensure compatibility with the new snowflake animation engine. This is a high-priority task for the Q4 release.',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w300,
                  height: 1.6,
                  color: Color(0xFF595C5E),
                ),
              ),
              isFullWidth: true,
            ),
            const SizedBox(height: 24),

            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _buildBentoSection(
                    context,
                    icon: Icons.terminal,
                    title: 'Repository',
                    iconColor: Theme.of(context).colorScheme.secondary,
                    child: const Text(
                      'github.com/yukika/iceberg-refactor',
                      style: TextStyle(
                        color: Color(0xFF005DA6),
                        fontWeight: FontWeight.bold,
                        decoration: TextDecoration.underline,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: _buildBentoSection(
                    context,
                    icon: Icons.group,
                    title: 'Team',
                    iconColor: Theme.of(context).colorScheme.secondary,
                    child: SizedBox(
                      height: 40,
                      child: Stack(
                        children: [
                          _buildAvatar(
                            0,
                            'https://lh3.googleusercontent.com/aida-public/AB6AXuB2DNzCS-GOV3GZnefRd9icP3OsHFwsQPWx_oVnBEkxOrnW6wObqmUHKcHK_lg3qBDMQGAK6TP5f0IljxPVqujwx7gyGcprSL0cvnjZDxkqNakeKA-7G11ccZTunvxBwjm_TnhH7Hr5fLGD5az6kf2E5m0xKiGPt4mseqLm2Bl1ybuQHNC9kJhomZK_fmpKAVC7fiPcfu1AOVDugB3ptn2KO9rsGV6djYat5FkwaSRjIzwkdcPfpI0OnjZvTi26G__nQtRSNLG2Yqr_',
                          ),
                          _buildAvatar(
                            1,
                            'https://lh3.googleusercontent.com/aida-public/AB6AXuDeqsgBvSt9mH2sz8VKJiH--9ke4bHKcQC6fTDG556Z4Fk_qy5tqB2ySdcgLWm-G_ZaL0ylsHGwsmWRLmPOiNQMa661Dh5XiTqEIQ8m3P4z05ctUKMcTdG2pSjJaCosfq_O1EuOLDpfdpIMqk4xa3PSe660PgToTcQ8WpGTOkz3IihF-BLnEYZhm0GBl6Ax6OlIFmZ7gU2RFC4yyCPi1ZSTe_jYGcqHAE9mHTFxsLeOru0LUnAmq5_sm0sE3c5o-vTdrQjv1XESKlfL',
                          ),
                          _buildAvatar(
                            2,
                            'https://lh3.googleusercontent.com/aida-public/AB6AXuBXCoOzNgpRyPBmsCzDFxqWSLUQi0NQALDH4k1Khnii22LPotzVhZzAZ_GUAdIoN463D8xiFoeKGZsBe66VkVucc6_tmhqmkXetSrHXx6xqw_CUcZAnU5UvZ0FIYwdlYwF5DZ4rlo6YaMGjQpgdzHzjTEKNKdGo4YfT899Ixi5XfMc0BJ7e57_ni_tafDDMQQccEtaUCsnQgpul3zr_EON-V3KYvRiD_9Od1MqlOjyN8RRVZbF3ZY1HGExXJGZiKxdcUOMKEiYQPEoF',
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),

            _buildBentoSection(
              context,
              icon: Icons.account_tree,
              title: 'Dependencies',
              iconColor: Theme.of(context).colorScheme.secondary,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(color: Colors.grey.withValues(alpha: 0.1)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.link, size: 14, color: Color(0xFF4555A8)),
                    SizedBox(width: 8),
                    Text(
                      'Glacier Asset Audit',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              isFullWidth: true,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildChip(
    BuildContext context,
    String label,
    Color bgColor,
    Color textColor, {
    IconData? icon,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: textColor),
            const SizedBox(width: 4),
          ],
          Text(
            label.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: textColor,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBentoSection(
    BuildContext context, {
    required IconData icon,
    required String title,
    required Color iconColor,
    required Widget child,
    bool isFullWidth = false,
  }) {
    return Container(
      width: isFullWidth ? double.infinity : null,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: isFullWidth ? Colors.white : const Color(0xFFEEF1F3),
        borderRadius: BorderRadius.circular(24),
        boxShadow: isFullWidth
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 40,
                  offset: const Offset(0, 20),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: iconColor, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _buildAvatar(int index, String url) {
    return Positioned(
      left: index * 20.0,
      child: Container(
        padding: const EdgeInsets.all(2),
        decoration: const BoxDecoration(
          color: Color(0xFFEEF1F3),
          shape: BoxShape.circle,
        ),
        child: CircleAvatar(radius: 16, backgroundImage: NetworkImage(url)),
      ),
    );
  }
}
