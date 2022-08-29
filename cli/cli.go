// Copyright 2021 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package cli

import (
	"context"
	"os"

	"github.com/harness/gitness/cli/execution"
	"github.com/harness/gitness/cli/pipeline"
	"github.com/harness/gitness/cli/server"
	"github.com/harness/gitness/cli/token"
	"github.com/harness/gitness/cli/user"
	"github.com/harness/gitness/cli/users"
	"github.com/harness/gitness/version"

	"gopkg.in/alecthomas/kingpin.v2"
)

// empty context
var nocontext = context.Background()

// application name
var application = "gitness"

// application description
var description = "description goes here" // TODO edit this application description

// Command parses the command line arguments and then executes a
// subcommand program.
func Command() {
	app := kingpin.New(application, description)
	server.Register(app)
	user.Register(app)
	pipeline.Register(app)
	execution.Register(app)
	users.Register(app)
	token.Register(app)
	registerLogin(app)
	registerLogout(app)
	registerRegister(app)
	registerSwagger(app)

	kingpin.Version(version.Version.String())
	kingpin.MustParse(app.Parse(os.Args[1:]))
}
