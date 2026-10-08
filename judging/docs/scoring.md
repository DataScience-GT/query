# Scoring

A project's rubric score is the weighted mean of its criterion values. Each judge's scores are then z-scored against that judge's own mean and spread and placed on the field's mean and spread, so a harsh judge and a lenient judge who ranked the same projects agree.

Projects with few votes are shrunk toward the field average. The config value `bayesian_c` is how many average votes that prior is worth. At 2, two real votes and the prior weigh the same.

Pairwise comparisons are a separate component. `pairwise_weight` is the share of the final score that comes from them. At 0 the ranking is the rubric score only, which matches a results run that never asked judges to compare tables.

Publishing freezes one result run. A later run can be diffed against it before it is published.
