package io.github.georgecodes.benchmarking.helidon.mp.graalvm;

import com.oracle.svm.core.annotate.Alias;
import com.oracle.svm.core.annotate.RecomputeFieldValue;
import com.oracle.svm.core.annotate.TargetClass;

/**
 * GraalVM native-image substitution that prevents ForkJoin worker threads from being
 * captured in the image heap via lock ownership fields.
 * <p>
 * During Helidon MP's build-time CDI bootstrap, {@code MpConfigProviderResolver} uses a
 * {@code ReentrantReadWriteLock} which captures the current thread (a ForkJoinWorkerThread)
 * as the lock's {@code exclusiveOwnerThread}. This thread object then ends up in the image
 * heap, but {@code InnocuousForkJoinWorkerThread} is enforced by GraalVM to be run-time
 * initialized — creating an unsolvable conflict.
 * <p>
 * This substitution resets the {@code exclusiveOwnerThread} field to {@code null} during
 * image generation, preventing the thread from being persisted in the heap.
 */
@TargetClass(java.util.concurrent.locks.AbstractOwnableSynchronizer.class)
final class AbstractOwnableSynchronizerSubstitution {

    /**
     * Aliased JDK field that records the owning thread of an exclusive synchronizer.
     *
     * <p>Reset during native-image build to avoid persisting a (build-time) worker thread instance
     * into the image heap.
     */
    @Alias
    @RecomputeFieldValue(kind = RecomputeFieldValue.Kind.Reset)
    private Thread exclusiveOwnerThread;
}