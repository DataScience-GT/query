package graphql

import (
	"sync"

	"cerebra/apps/api/internal/graphql/generated"
)

// Resolver is the root dependency container for gqlgen resolvers.
type Resolver struct{}

// Query returns an implementation of the GraphQL query resolvers.
func (r *Resolver) Query() generated.QueryResolver {
	return &queryResolver{r}
}

// Mutation returns an implementation of the GraphQL mutation resolvers.
func (r *Resolver) Mutation() generated.MutationResolver {
	return &mutationResolver{r}
}

// The actual structs used for resolvers
type queryResolver struct{ *Resolver }
type mutationResolver struct{ *Resolver }

// In-memory stores (thread-safe)
var (
	usersMu sync.Mutex
	users   = []*generated.User{}

	teamsMu sync.Mutex
	teams   = []*generated.HackathonTeam{}

	eventsMu sync.Mutex
	events   = []*generated.ClubEvent{}
)
