package com.benchmarking.domain;

import java.util.ArrayList;
import java.util.List;

/**
 * Minimal tokenizer that supports:
 * - whitespace separation
 * - double/single quoted segments
 * - backslash escaping inside quotes
 * This avoids invoking a shell.
 */
public final class CommandTokenizer {
  private CommandTokenizer() { }

  public static List<String> tokenize(String command) {
    if (command == null) {
      return List.of();
    }

    List<String> out = new ArrayList<>();
    StringBuilder cur = new StringBuilder();
    boolean inSingle = false;
    boolean inDouble = false;
    boolean escaping = false;

    for (int i = 0; i < command.length(); i++) {
      char c = command.charAt(i);

      if (escaping) {
        cur.append(c);
        escaping = false;
        continue;
      }

      if (c == '\\' && (inSingle || inDouble)) {
        escaping = true;
        continue;
      }

      if (c == '\'' && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (c == '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }

      if (!inSingle && !inDouble && Character.isWhitespace(c)) {
        if (!cur.isEmpty()) {
          out.add(cur.toString());
          cur.setLength(0);
        }
        continue;
      }

      cur.append(c);
    }

    if (!cur.isEmpty()) {
      out.add(cur.toString());
    }
    return out;
  }
}
