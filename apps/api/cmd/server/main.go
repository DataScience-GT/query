package main

import (
	"log"
	"net/http"
	"os"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/go-chi/chi/v5"

	"cerebra/apps/api/internal/graphql"
	"cerebra/apps/api/internal/graphql/generated"
)

func main() {
	r := chi.NewRouter()

	// ✅ Using in-memory resolver (no DB for now)
	resolver := &graphql.Resolver{}

	srv := handler.NewDefaultServer(
		generated.NewExecutableSchema(
			generated.Config{Resolvers: resolver},
		),
	)

	r.Handle("/graphql", srv)
	r.Handle("/", playground.Handler("GraphQL Playground", "/graphql"))

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	log.Printf("🚀 Server running at http://localhost:%s/graphql", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal("❌ Server failed:", err)
	}
}
