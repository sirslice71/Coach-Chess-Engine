# Coach Philosophy

Rule #1 - The engine should know nothing about the UI.

The Board should know the rules.

The Search should know strategy.

The UI should know presentation.

Every subsystem owns its own constants.

Coach is designed around ideas instead of moves.

Good chess is not:

"Develop your knight."

Good chess is:

Improve development.

Increase center control.

Improve king safety.

Increase piece activity.

Create threats.

Every evaluation term should describe a chess principle.

Never reward a move simply because it is a certain piece.

Reward what the move accomplishes.

## Explainability

Every evaluation term should be explainable.

If the engine awards +14 centipawns,
it should also be able to explain WHY.

Coach should never become a black box.

## Architecture

Small files.

Single responsibility.

Readable code.

Fast code.

Correct code.

Documentation before cleverness.

## Features

A feature is complete only when it is:

Correct
Tested
Documented
Understandable
Extensible