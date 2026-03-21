import 'package:flutter/material.dart';

class YukikaTextField extends StatelessWidget {
  final String label;
  final String hintText;
  final IconData? suffixIcon;
  final bool obscureText;
  final TextEditingController? controller;

  const YukikaTextField({
    super.key,
    required this.label,
    required this.hintText,
    this.suffixIcon,
    this.obscureText = false,
    this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.bold,
              color: Theme.of(context).colorScheme.onSurface,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFFD9DDE0), // surface-container-highest
            borderRadius: BorderRadius.circular(16),
          ),
          child: TextField(
            controller: controller,
            obscureText: obscureText,
            decoration: InputDecoration(
              hintText: hintText,
              hintStyle: const TextStyle(
                color: Color(0xFFABADAF),
              ), // outline-variant
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 16,
              ),
              suffixIcon: suffixIcon != null
                  ? Icon(suffixIcon, color: const Color(0xFFABADAF))
                  : null,
            ),
          ),
        ),
      ],
    );
  }
}
