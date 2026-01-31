# Patches

This directory contains patches applied to the OpenClaw installation.

## openclaw-gif-fix.patch
Forces optimization (conversion to static image) for GIFs.
Fixes crash with Gemini when sending raw animated GIFs.
Apply with: `patch -p1 < patches/openclaw-gif-fix.patch` in the openclaw install directory.
