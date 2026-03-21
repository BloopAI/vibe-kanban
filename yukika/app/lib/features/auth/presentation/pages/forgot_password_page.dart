import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/widgets/yukika_text_field.dart';
import '../../../../core/widgets/yukika_button.dart';

class ForgotPasswordPage extends StatelessWidget {
  const ForgotPasswordPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back, color: Color(0xFF0091FF)),
        ),
        title: const Text(
          'Reset Password',
          style: TextStyle(
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: FontWeight.bold,
            color: Color(0xFF0091FF),
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Stack(
        children: [
          // Decorative elements
          Positioned(
            top: -100,
            right: -50,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.secondaryContainer.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(150),
              ),
            ),
          ),
          Positioned(
            bottom: -50,
            left: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.primaryContainer.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(125),
              ),
            ),
          ),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Icon
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 40,
                            offset: const Offset(0, 20),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.ac_unit,
                        size: 48,
                        color: Color(0xFF005DA6),
                      ),
                    ),
                    const SizedBox(height: 32),

                    Text(
                      'No worries!',
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            fontFamily: 'Plus Jakarta Sans',
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      "It happens to the best of us. Enter your email and we'll send a reset link.",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 16,
                        color: Color(0xFF595C5E),
                        height: 1.5,
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
                            color: Colors.black.withValues(alpha: 0.06),
                            blurRadius: 40,
                            offset: const Offset(0, 20),
                          ),
                        ],
                      ),
                      child: Column(
                        children: [
                          const YukikaTextField(
                            label: 'Email Address',
                            hintText: 'you@example.com',
                            suffixIcon: Icons.mail_outline,
                          ),
                          const SizedBox(height: 32),
                          YukikaButton(
                            text: 'Send Reset Link',
                            onPressed: () => context.pop(),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 40),

                    // Back to Sign In
                    TextButton.icon(
                      onPressed: () => context.pop(),
                      icon: const Icon(Icons.login, size: 18),
                      label: const Text(
                        'Back to Sign In',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
