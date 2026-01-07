package com.benchmarking.api;

import java.time.Instant;

/**
 * Event emitted during job execution for real-time updates.
 */
public class JobEvent {
  /**
   * Event type: log | status.
   */
  private String type;
  
  /**
   * Stream identifier: stdout | stderr | system.
   */
  private String stream;
  
  /**
   * Timestamp when the event was created.
   */
  private Instant ts;
  
  /**
   * Event message content.
   */
  private String message;

  /**
   * Default constructor for JobEvent.
   */
  public JobEvent() { }

  /**
   * Gets the event type.
   *
   * @return the event type
   */
  public String getType() {
    return type;
  }

  /**
   * Sets the event type.
   *
   * @param type the event type
   */
  public void setType(String type) {
    this.type = type;
  }

  /**
   * Gets the stream identifier.
   *
   * @return the stream identifier
   */
  public String getStream() {
    return stream;
  }

  /**
   * Sets the stream identifier.
   *
   * @param stream the stream identifier
   */
  public void setStream(String stream) {
    this.stream = stream;
  }

  /**
   * Gets the timestamp.
   *
   * @return the timestamp
   */
  public Instant getTs() {
    return ts;
  }

  /**
   * Sets the timestamp.
   *
   * @param ts the timestamp
   */
  public void setTs(Instant ts) {
    this.ts = ts;
  }

  /**
   * Gets the message.
   *
   * @return the message
   */
  public String getMessage() {
    return message;
  }

  /**
   * Sets the message.
   *
   * @param message the message
   */
  public void setMessage(String message) {
    this.message = message;
  }

  /**
   * Creates a log event from a specific stream.
   *
   * @param stream the stream (stdout/stderr)
   * @param message the log message
   * @return a new log JobEvent
   */
  public static JobEvent log(String stream, String message) {
    JobEvent e = new JobEvent();
    e.setType("log");
    e.setStream(stream);
    e.setTs(Instant.now());
    e.setMessage(message);
    return e;
  }

  /**
   * Creates a status event.
   *
   * @param message the status message
   * @return a new status JobEvent
   */
  public static JobEvent status(String message) {
    JobEvent e = new JobEvent();
    e.setType("status");
    e.setStream("system");
    e.setTs(Instant.now());
    e.setMessage(message);
    return e;
  }
}
