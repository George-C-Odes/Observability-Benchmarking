package io.github.georgecodes.benchmarking.helidon.mp.graalvm;

import com.oracle.svm.core.annotate.Substitute;
import com.oracle.svm.core.annotate.TargetClass;

import java.util.Collection;
import java.util.List;
import java.util.concurrent.Callable;

/**
 * Native-image substitution for Weld's {@code AbstractExecutorServices}.
 * <p>
 * During GraalVM native-image build, Helidon's {@code HelidonMpFeature} triggers
 * {@code BuildTimeInitializer.<clinit>} which boots the CDI container.  Weld's
 * {@code ConcurrentBeanDeployer.createClassBeans()} calls
 * {@code AbstractExecutorServices.invokeAllAndCheckForExceptions()} which submits
 * tasks to {@code ForkJoinPool.commonPool()}.
 * <p>
 * This deadlocks because:
 * <ol>
 *   <li>Main thread runs {@code BuildTimeInitializer.<clinit>} and waits for
 *       ForkJoinPool tasks to complete.</li>
 *   <li>GraalVM analysis worker threads (also on the commonPool) discover
 *       {@code BuildTimeInitializer} and call {@code ensureClassInitialized()},
 *       blocking on the JVM class initialization lock held by the main thread.</li>
 * </ol>
 * <p>
 * This substitution replaces the parallel invocation with a sequential one,
 * avoiding the ForkJoinPool deadlock entirely.  The slight build-time performance
 * loss is negligible compared to the overall native-image build time.
 */
@TargetClass(className = "org.jboss.weld.executor.AbstractExecutorServices")
final class WeldExecutorSubstitution {

    @Substitute
    public <T> List<T> invokeAllAndCheckForExceptions(Collection<? extends Callable<T>> tasks) {
        @SuppressWarnings("unchecked")
        T[] results = (T[]) new Object[tasks.size()];
        int i = 0;
        for (Callable<T> task : tasks) {
            try {
                results[i++] = task.call();
            } catch (Exception e) {
                throw new RuntimeException("Weld executor task failed", e);
            }
        }
        return List.of(results);
    }
}