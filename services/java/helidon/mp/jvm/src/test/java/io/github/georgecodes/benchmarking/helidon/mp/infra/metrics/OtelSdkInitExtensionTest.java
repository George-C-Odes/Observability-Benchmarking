package io.github.georgecodes.benchmarking.helidon.mp.infra.metrics;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertFalse;

class OtelSdkInitExtensionTest {

    @Test
    void constructorAndNativeImageDetectionWorkOnJvm() throws Exception {
        new OtelSdkInitExtension();

        Method method = OtelSdkInitExtension.class.getDeclaredMethod("isNativeImageBuildTime");
        method.setAccessible(true);

        boolean nativeImageBuild = (boolean) method.invoke(null);

        assertFalse(nativeImageBuild);
    }
}
