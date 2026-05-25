package io.kestra.webserver.services;

import java.util.List;
import java.util.Objects;

import org.slf4j.event.Level;

import io.kestra.core.models.QueryFilter;
import io.kestra.core.models.namespaces.Namespace;
import io.kestra.core.runners.FollowLogEvent;
import io.kestra.core.services.FollowLogEventMatcher;
import io.kestra.webserver.utils.Searchable;

import io.micronaut.context.annotation.Factory;
import jakarta.inject.Named;
import jakarta.inject.Singleton;

@Factory
public class SearchableFactory {

    @Singleton
    @Named("NAMESPACE")
    public Searchable<Namespace> namespaceSearchable() {
        return Searchable.<Namespace>builder()
            .searchableExtractor("id", Namespace::getId)
            .sortableExtractor("id", Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.QUERY, QueryFilter.Op.EQUALS, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.EQUALS, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.NOT_EQUALS, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.CONTAINS, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.STARTS_WITH, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.ENDS_WITH, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.REGEX, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.IN, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.NOT_IN, Namespace::getId)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.PREFIX, Namespace::getId)
            .build();
    }

    /**
     * Predicates for live filtering of {@link FollowLogEvent}s in the streaming pub/sub layer.
     * Mirrors the QueryFilter contract for {@code Resource.LOG} so that the same filter list
     * sent to {@code /logs/{executionId}/follow} drives both the historical replay (via the
     * repository's {@code findAsync}) and the live tail (via this {@code Searchable}).
     */
    @Singleton
    @Named("FOLLOW_LOG_EVENT")
    public Searchable<FollowLogEvent> followLogEventSearchable() {
        return Searchable.<FollowLogEvent>builder()
            // LEVEL needs typed Level.toInt() comparison — not amenable to the string-based defaults.
            .searchableQueryFilterExtractor(QueryFilter.Field.LEVEL, QueryFilter.Op.GREATER_THAN_OR_EQUAL_TO,
                (event, v) -> event.level() != null && event.level().toInt() >= toLevel(v).toInt())
            .searchableQueryFilterExtractor(QueryFilter.Field.LEVEL, QueryFilter.Op.LESS_THAN_OR_EQUAL_TO,
                (event, v) -> event.level() != null && event.level().toInt() <= toLevel(v).toInt())

            .searchableQueryFilterExtractor(QueryFilter.Field.EXECUTION_ID, QueryFilter.Op.EQUALS, FollowLogEvent::executionId)
            .searchableQueryFilterExtractor(QueryFilter.Field.EXECUTION_ID, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::executionId)
            .searchableQueryFilterExtractor(QueryFilter.Field.EXECUTION_ID, QueryFilter.Op.IN, FollowLogEvent::executionId)
            .searchableQueryFilterExtractor(QueryFilter.Field.EXECUTION_ID, QueryFilter.Op.NOT_IN, FollowLogEvent::executionId)

            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_ID, QueryFilter.Op.EQUALS, FollowLogEvent::taskId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_ID, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::taskId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_ID, QueryFilter.Op.IN, FollowLogEvent::taskId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_ID, QueryFilter.Op.NOT_IN, FollowLogEvent::taskId)

            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_RUN_ID, QueryFilter.Op.EQUALS, FollowLogEvent::taskRunId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_RUN_ID, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::taskRunId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_RUN_ID, QueryFilter.Op.IN, FollowLogEvent::taskRunId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TASK_RUN_ID, QueryFilter.Op.NOT_IN, FollowLogEvent::taskRunId)

            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.EQUALS, FollowLogEvent::namespace)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::namespace)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.STARTS_WITH, FollowLogEvent::namespace)
            .searchableQueryFilterExtractor(QueryFilter.Field.NAMESPACE, QueryFilter.Op.PREFIX, FollowLogEvent::namespace)

            .searchableQueryFilterExtractor(QueryFilter.Field.FLOW_ID, QueryFilter.Op.EQUALS, FollowLogEvent::flowId)
            .searchableQueryFilterExtractor(QueryFilter.Field.FLOW_ID, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::flowId)
            .searchableQueryFilterExtractor(QueryFilter.Field.FLOW_ID, QueryFilter.Op.IN, FollowLogEvent::flowId)

            .searchableQueryFilterExtractor(QueryFilter.Field.TRIGGER_ID, QueryFilter.Op.EQUALS, FollowLogEvent::triggerId)
            .searchableQueryFilterExtractor(QueryFilter.Field.TRIGGER_ID, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::triggerId)

            .searchableQueryFilterExtractor(QueryFilter.Field.ATTEMPT_NUMBER, QueryFilter.Op.EQUALS, FollowLogEvent::attemptNumber)
            .searchableQueryFilterExtractor(QueryFilter.Field.ATTEMPT_NUMBER, QueryFilter.Op.NOT_EQUALS, FollowLogEvent::attemptNumber)
            .searchableQueryFilterExtractor(QueryFilter.Field.ATTEMPT_NUMBER, QueryFilter.Op.IN, FollowLogEvent::attemptNumber)
            .searchableQueryFilterExtractor(QueryFilter.Field.ATTEMPT_NUMBER, QueryFilter.Op.NOT_IN, FollowLogEvent::attemptNumber)
            .build();
    }

    /**
     * Expose the {@link FollowLogEvent} {@link Searchable} as a {@link FollowLogEventMatcher} so
     * {@code LogStreamingService} (in core) can apply QueryFilters to live events without
     * depending on the webserver-side {@code Searchable} class.
     */
    @Singleton
    public FollowLogEventMatcher followLogEventMatcher(
        @Named("FOLLOW_LOG_EVENT") Searchable<FollowLogEvent> searchable
    ) {
        return searchable::matches;
    }

    private static Level toLevel(Object value) {
        return value instanceof Level lvl ? lvl : Level.valueOf(value.toString());
    }
}
