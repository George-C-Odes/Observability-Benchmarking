package com.benchmarking.api;

import jakarta.validation.constraints.NotBlank;

public class RunRequest {
  @NotBlank
  public String command;
}
