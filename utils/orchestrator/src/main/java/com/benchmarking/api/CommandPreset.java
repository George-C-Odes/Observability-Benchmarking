package com.benchmarking.api;

/**
 * A preconfigured Docker command discovered from IntelliJ's .run XML files.
 * category: one of build-img | single-cont | multi-cont
 * title: human-friendly name
 * command: plain docker command to send to /v1/run
 * sourceFile: the originating .run XML file (relative path)
 */
public record CommandPreset(
    String category,
    String title,
    String command,
    String sourceFile
) {}
