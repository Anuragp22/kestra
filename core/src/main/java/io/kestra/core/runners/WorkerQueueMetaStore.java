package io.kestra.core.runners;

import java.util.Optional;
import java.util.Set;

import io.micronaut.context.annotation.Requires;
import io.micronaut.context.annotation.Secondary;
import jakarta.inject.Singleton;

/**
 * Service interface for accessing Worker Queue routing data from a Kestra's Executor
 * service.
 *
 * <p>Worker Queues are identified by their user-supplied {@code id} — the routing
 * identity used to dispatch jobs to queues. The {@code id} is immutable: tags, tenant
 * scope, and metadata may change on a queue, but its {@code id} cannot.
 */
public interface WorkerQueueMetaStore {

    /**
     * Checks whether the Worker Queue is available.
     * <p>
     * A Worker Queue is available if at least one worker is running and subscribed to it.
     *
     * @param id The Worker Queue's id - can be {@code null}.
     * @return {@code true} if the Worker Queue is available, or is {@code null}, {@code false} otherwise.
     */
    boolean isWorkerQueueAvailableForId(String id);

    /**
     * Returns the set of all existing Worker Queue ids.
     */
    Set<String> listAllWorkerQueueIds();

    /**
     * Resolves the id of the most specific Worker Queue whose tag set contains all
     * {@code requiredTags} and is accessible to {@code tenant}.
     *
     * <p>"Most specific" = fewest extra tags; ties are broken alphabetically on the id.
     *
     * @param requiredTags the required tags (case-insensitive match against Worker Queue tags)
     * @param tenant       the tenant id, may be {@code null}
     * @return the winning Worker Queue id, or {@link Optional#empty()} if none match
     */
    Optional<String> resolveQueueIdByTags(Set<String> requiredTags, String tenant);

    /**
     * Default {@link WorkerQueueMetaStore} implementation.
     * This class is only used if no other implementation exist.
     */
    @Singleton
    @Requires(missingBeans = WorkerQueueMetaStore.class)
    @Secondary
    class DefaultWorkerQueueMetaStore implements WorkerQueueMetaStore {
        @Override
        public boolean isWorkerQueueAvailableForId(String id) {
            return true;
        }

        @Override
        public Set<String> listAllWorkerQueueIds() {
            return Set.of();
        }

        @Override
        public Optional<String> resolveQueueIdByTags(Set<String> requiredTags, String tenant) {
            return Optional.empty();
        }
    }
}
