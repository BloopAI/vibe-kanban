rm -rf /tmp/holicode-test/.holicode/ /tmp/holicode-test/.clinerules/ /tmp/holicode-test/.github/agents/ /tmp/holicode-test/.github/skills/ /tmp/holicode-test/*
cd /tmp/holicode-test/ && ~/git/holicode/scripts/update.sh ~/git/holicode/
mkdir -p /tmp/holicode-test/.holicode/analysis/scratch/
cp ~/git/holicode/test-resources/poc-task-tracker/business-brief.md /tmp/holicode-test/.holicode/analysis/scratch/


