# v0.2.1 runtime repair

The reported failure is the depth-array lookup in f_drawHistory. The renderer now queues each node ID and depth in one DrawTask record; it returns a separate ID list to callers. This removes the mismatched parallel-array lookup instead of truncating the traversal and losing subwaves.

45 local tests pass, including the seventh-entry-after-six-roots regression, depth filtering, empty/unresolved children and alternate root traversal. Pine static analysis reports zero issues. Live TradingView execution of this fix has not been retested.
