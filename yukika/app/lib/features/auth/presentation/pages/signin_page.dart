import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/yukika_text_field.dart';
import '../../../../core/widgets/yukika_button.dart';

class SignInPage extends StatelessWidget {
  const SignInPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Background abstract snowdrifts (simplified)
          Positioned(
            bottom: -50,
            left: -100,
            child: Container(
              width: 300,
              height: 150,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.primaryContainer.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(150),
              ),
            ),
          ),
          Positioned(
            bottom: -50,
            right: -100,
            child: Container(
              width: 300,
              height: 150,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.secondaryContainer.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(150),
              ),
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Header Branding
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 20,
                  ),
                  child: Row(
                    children: [
                      Text(
                        'Yukika',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),

                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Welcome Header
                          Text(
                            'Welcome Back!',
                            style: Theme.of(context).textTheme.headlineMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Slide back into your productivity flow.',
                            style: TextStyle(
                              color: Color(0xFF595C5E), // on-surface-variant
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 40),

                          // Sign In Card
                          Container(
                            padding: const EdgeInsets.all(32),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(24),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(
                                    0xFF2C2F31,
                                  ).withValues(alpha: 0.06),
                                  blurRadius: 40,
                                  offset: const Offset(0, 20),
                                ),
                              ],
                            ),
                            child: Column(
                              children: [
                                const YukikaTextField(
                                  label: 'Email Address',
                                  hintText: 'hello@yukika.ai',
                                  suffixIcon: Icons.mail_outline,
                                ),
                                const SizedBox(height: 24),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Padding(
                                          padding: const EdgeInsets.only(
                                            left: 4,
                                            bottom: 8,
                                          ),
                                          child: Text(
                                            'Password',
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall
                                                ?.copyWith(
                                                  fontWeight: FontWeight.bold,
                                                ),
                                          ),
                                        ),
                                        GestureDetector(
                                          onTap: () =>
                                              context.push('/forgot-password'),
                                          child: Text(
                                            'Forgot Password?',
                                            style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.bold,
                                              color: Theme.of(
                                                context,
                                              ).colorScheme.primary,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const YukikaTextField(
                                      label:
                                          '', // Label handled above for custom layout
                                      hintText: '••••••••',
                                      obscureText: true,
                                      suffixIcon: Icons.lock_outline,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 32),
                                YukikaButton(
                                  text: 'Sign In',
                                  onPressed: () => context.go('/kanban'),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 32),

                          // Sign Up Link
                          Wrap(
                            alignment: WrapAlignment.center,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            spacing: 8,
                            runSpacing: 4,
                            children: [
                              const Text(
                                "Don't have an account yet?",
                                style: TextStyle(
                                  fontWeight: FontWeight.w500,
                                  color: Color(0xFF595C5E),
                                ),
                              ),
                              TextButton(
                                onPressed: () => context.push('/signup'),
                                child: Text(
                                  'Create an Account',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).colorScheme.primary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
