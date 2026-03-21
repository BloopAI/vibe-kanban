import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/yukika_text_field.dart';
import '../../../../core/widgets/yukika_button.dart';

class SignUpPage extends StatelessWidget {
  const SignUpPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Yukika',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  TextButton(
                    onPressed: () => context.go('/signin'),
                    child: Text(
                      'Sign In',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 40),

              // Title
              Text(
                'Create Account',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                "Welcome to the playground. Let's get started.",
                style: TextStyle(
                  color: Color(0xFF595C5E),
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 40),

              // Form Card
              Container(
                padding: const EdgeInsets.all(32),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF2C2F31).withValues(alpha: 0.06),
                      blurRadius: 40,
                      offset: const Offset(0, 20),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    const YukikaTextField(
                      label: 'Full Name',
                      hintText: 'E.g. Yuki Tanaka',
                      suffixIcon: Icons.person_outline,
                    ),
                    const SizedBox(height: 24),
                    const YukikaTextField(
                      label: 'Email Address',
                      hintText: 'hello@yukika.ai',
                      suffixIcon: Icons.mail_outline,
                    ),
                    const SizedBox(height: 24),
                    const YukikaTextField(
                      label: 'Password',
                      hintText: '••••••••',
                      obscureText: true,
                      suffixIcon: Icons.visibility_outlined,
                    ),
                    const SizedBox(height: 32),
                    YukikaButton(
                      text: 'Sign Up',
                      onPressed: () => context.go('/kanban'),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 40),

              // Decorative Section (Hidden on small mobile if needed, but here simple)
              Row(
                children: [
                  Expanded(
                    child: _buildBentoItem(
                      context,
                      icon: Icons.auto_awesome,
                      label: 'AI Insights',
                      color: Theme.of(context).colorScheme.primaryContainer,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _buildBentoItem(
                      context,
                      icon: Icons.ac_unit,
                      label: 'Alpine Flow',
                      color: Theme.of(context).colorScheme.secondaryContainer,
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 40),

              // Footer
              Center(
                child: Column(
                  children: [
                    const Text(
                      '© 2024 Yukika AI. All rights reserved.',
                      style: TextStyle(fontSize: 12, color: Color(0xFF595C5E)),
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 24,
                      runSpacing: 8,
                      children: [
                        _buildFooterLink('Help'),
                        _buildFooterLink('Privacy'),
                        _buildFooterLink('Terms'),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBentoItem(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          const SizedBox(height: 12),
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _buildFooterLink(String label) {
    return Text(
      label.toUpperCase(),
      style: const TextStyle(
        fontSize: 10,
        fontWeight: FontWeight.bold,
        color: Color(0xFF747779), // outline
        letterSpacing: 1.0,
      ),
    );
  }
}
