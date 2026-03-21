import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/yukika_text_field.dart';

class NewTaskPage extends StatelessWidget {
  const NewTaskPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0091FF)),
        ),
        title: const Text(
          'New Task',
          style: TextStyle(
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: FontWeight.bold,
            color: Color(0xFF2C2F31),
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 8, 24, 120),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const YukikaTextField(
                  label: 'Task Title',
                  hintText: "What's the goal?",
                ),
                const SizedBox(height: 24),

                // Description
                const Padding(
                  padding: EdgeInsets.only(left: 4, bottom: 8),
                  child: Text(
                    'Description',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                  ),
                ),
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFFFF),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 40,
                        offset: const Offset(0, 20),
                      ),
                    ],
                  ),
                  child: const TextField(
                    maxLines: 4,
                    decoration: InputDecoration(
                      hintText: 'Add some context for your team...',
                      hintStyle: TextStyle(
                        color: Color(0xFFABADAF),
                        fontSize: 14,
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.all(20),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Project & URL
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(left: 4, bottom: 8),
                            child: Text(
                              'Project',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 14,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEEF1F3),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: DropdownButtonHideUnderline(
                              child: DropdownButton<String>(
                                isExpanded: true,
                                value: 'Design System Revamp',
                                items:
                                    [
                                      'Design System Revamp',
                                      'Cloud Migration',
                                      'Winter Launch',
                                    ].map((String value) {
                                      return DropdownMenuItem<String>(
                                        value: value,
                                        child: Text(
                                          value,
                                          style: const TextStyle(fontSize: 14),
                                        ),
                                      );
                                    }).toList(),
                                onChanged: (_) {},
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: const YukikaTextField(
                        label: 'Repository URL',
                        hintText: 'github.com/...',
                        suffixIcon: Icons.link,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                const YukikaTextField(
                  label: 'Dependencies',
                  hintText: 'Search for dependent tasks...',
                  suffixIcon: Icons.account_tree,
                ),
                const SizedBox(height: 32),

                // Team Members
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'ADD TEAM MEMBERS',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF4555A8),
                        letterSpacing: 1.0,
                      ),
                    ),
                    TextButton(
                      onPressed: () {},
                      child: const Text(
                        'View All',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 90,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    children: [
                      _buildAddMemberButton(),
                      _buildTeamMember(
                        'Alex',
                        'https://lh3.googleusercontent.com/aida-public/AB6AXuCVTNhyV2AQY6WDdtS9WaANVJJHrsqj7A1l0z93VUB1mTBBoeNSBPnzzCUZ-VKToPvMG2l3Fb-uDy3dBIdAeu6cw4ZCIgbdxQu6wmM7P9DJcPCxU1ErGpUShOtOW_048wo2Z1g-OpRclAncq8swqb5sU5gR8C12J3X7LKBvOjLqg-3v9cEJvooXAYZYyWlUwewhXDRLL5z_PqgAKJHB-JE-nkz6W64vjSbtgMFnoTspTTYw6lpbu5TIKakvil-hzgmeMOl7IEZIannJ',
                      ),
                      _buildTeamMember(
                        'Sarah',
                        'https://lh3.googleusercontent.com/aida-public/AB6AXuApz6X4hNUlBjNlSxAY9Gm1Hn05AIhLvbnMZegqUOiZ_xjziX7RLrnC9OC7haTkDqMzhl2-TfHO6e8nwrFH3M4BCvHOQxxJaB5qhLzaj8he9y9ETAkHTXuFg_OExi-boSRf-1aGTjryDEuFmITXAn5S7b71iJVrl8jUIR0q6jq8dyOatcsUiiTKxFnBJm77UasfyYmFh2vG9sQsgO42UZoIa1O1En8sImH-9-7XXLmBK1ggs16jcK5Uu6cPLndA-wj6MWptONdWeY7X',
                      ),
                      _buildTeamMember(
                        'Jordan',
                        'https://lh3.googleusercontent.com/aida-public/AB6AXuCnn8VcVIxewKpio6dPzCj1iaYK1YCbKA9bKGEw4DHwI3wfq0UeFI3eIVxVB0erpW1iaLeF3r_7GFIn0X6r94q5EW5-oM-FxFmAoAHuLqhIwDd65pTFRXd_4arkegb0SRqZHw8oHZZI0T7fdvjbibUuzPNlnB3-apam_KamAXNdqLohMz9Sc-3OBrs3mhJx5xOj57xth_j1INNDhx3hyLRfK8t_HWl6RTN6L-Ml5hMVhYnpDEUL0ChsOXAwTGvp_BYKcBjrWJM72oyp',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Sticky Create Button
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 40),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.8),
                  ),
                  child: Column(
                    children: [
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Color(0xFF005DA6), Color(0xFF54A3FF)],
                            ),
                            borderRadius: BorderRadius.circular(28),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF005DA6).withValues(
                                  alpha: 0.2,
                                ),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: ElevatedButton(
                            onPressed: () => context.pop(),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              shadowColor: Colors.transparent,
                              shape: const StadiumBorder(),
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Text(
                                  'Create Task',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 18,
                                  ),
                                ),
                                SizedBox(width: 8),
                                Icon(Icons.bolt, color: Colors.white),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        "Let's turn your ideas into a fresh glacier-sized achievement.",
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddMemberButton() {
    return Container(
      width: 64,
      height: 64,
      margin: const EdgeInsets.only(right: 16),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: const Color(0xFFABADAF),
          width: 2,
          style: BorderStyle.none,
        ), // Simplification
      ),
      child: DottedBorderPlaceholder(
        child: const Icon(Icons.person_add, color: Color(0xFFABADAF)),
      ),
    );
  }

  Widget _buildTeamMember(String name, String url) {
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 10,
                ),
              ],
            ),
            child: CircleAvatar(backgroundImage: NetworkImage(url)),
          ),
          const SizedBox(height: 8),
          Text(
            name,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFF595C5E),
            ),
          ),
        ],
      ),
    );
  }
}

class DottedBorderPlaceholder extends StatelessWidget {
  final Widget child;
  const DottedBorderPlaceholder({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: const Color(0xFFABADAF),
          style: BorderStyle.solid,
        ), // Simplified dotted
      ),
      child: Center(child: child),
    );
  }
}
