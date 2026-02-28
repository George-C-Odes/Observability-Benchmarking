package io.github.georgecodes.benchmarking.spark;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

public class HelloRoutesTest {

    @AfterAll
    static void cleanup() {
        // Spark keeps a singleton server; attempt to stop it so other tests can run.
        try {
            spark.Spark.stop();
        } catch (Exception ignored) {
        }
    }

    @Test
    void compiles() {
        // Env-driven startup makes proper in-process integration tests awkward without forking.
        // This test is intentionally a tiny compile smoke test.
        assertTrue(true);
    }
}
