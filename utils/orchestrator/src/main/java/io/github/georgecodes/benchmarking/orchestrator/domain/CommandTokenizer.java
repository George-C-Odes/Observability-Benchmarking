package io.github.georgecodes.benchmarking.orchestrator.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * Minimal tokenizer that supports: - whitespace separation - double/single quoted segments -
 * backslash escaping inside quotes This avoids invoking a shell.
 */
public final class CommandTokenizer {
  /** Utility class. */
  private CommandTokenizer() {}

  /**
   * Splits a command string into shell-free argument tokens while honoring quotes.
   *
   * @param command the command string to tokenize
   * @return the parsed argument tokens, or an empty list when the input is {@code null}
   */
  public static List<String> tokenize(String command) {
    if (command == null) {
      return List.of();
    }
    return new Tokenizer(command).tokenize();
  }

  /** Stateful tokenizer implementation for one command string. */
  private static final class Tokenizer {

    /** Command text being tokenized. */
    private final String command;

    /** Parsed tokens. */
    private final List<String> out = new ArrayList<>();

    /** Whether parsing is currently inside single quotes. */
    private boolean inSingle;

    /** Whether parsing is currently inside double quotes. */
    private boolean inDouble;

    /** Whether the previous character started an escape sequence. */
    private boolean escaping;

    /**
     * Creates a tokenizer for one command string.
     *
     * @param command command text being tokenized
     */
    private Tokenizer(String command) {
      this.command = command;
    }

    /**
     * Tokenizes the configured command.
     *
     * @return parsed argument tokens
     */
    private List<String> tokenize() {
      StringBuilder current = new StringBuilder();
      for (int i = 0; i < command.length(); i++) {
        accept(command.charAt(i), current);
      }
      flushToken(current);
      return out;
    }

    /**
     * Consumes one command character.
     *
     * @param value the character to consume
     * @param current the current token buffer
     */
    private void accept(char value, StringBuilder current) {
      if (appendEscaped(value, current)
          || startEscape(value)
          || toggleQuote(value)
          || emitOnWhitespace(value, current)) {
        return;
      }
      current.append(value);
    }

    /**
     * Appends an escaped character when an escape sequence is active.
     *
     * @param value the character to consume
     * @param current the current token buffer
     * @return {@code true} when the character was consumed
     */
    private boolean appendEscaped(char value, StringBuilder current) {
      if (!escaping) {
        return false;
      }
      current.append(value);
      escaping = false;
      return true;
    }

    /**
     * Starts an escape sequence inside quotes.
     *
     * @param value the character to consume
     * @return {@code true} when the character was consumed
     */
    private boolean startEscape(char value) {
      if (value != '\\' || (!inSingle && !inDouble)) {
        return false;
      }
      escaping = true;
      return true;
    }

    /**
     * Toggles quote state when a quote delimiter is encountered.
     *
     * @param value the character to consume
     * @return {@code true} when the character was consumed
     */
    private boolean toggleQuote(char value) {
      if (value == '\'' && !inDouble) {
        inSingle = !inSingle;
        return true;
      }
      if (value == '"' && !inSingle) {
        inDouble = !inDouble;
        return true;
      }
      return false;
    }

    /**
     * Emits the current token when unquoted whitespace is encountered.
     *
     * @param value the character to consume
     * @param current the current token buffer
     * @return {@code true} when the character was consumed
     */
    private boolean emitOnWhitespace(char value, StringBuilder current) {
      if (inSingle || inDouble || !Character.isWhitespace(value)) {
        return false;
      }
      flushToken(current);
      return true;
    }

    /**
     * Emits the current token if it is non-empty.
     *
     * @param current the current token buffer
     */
    private void flushToken(StringBuilder current) {
      if (!current.isEmpty()) {
        out.add(current.toString());
        current.setLength(0);
      }
    }
  }
}
