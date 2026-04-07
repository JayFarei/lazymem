VERSION := $(shell node -p "require('./package.json').version")

.PHONY: check release

check:
	@./bin/lazymem --version
	@echo "OK"

release:
	@if [ -n "$$(git status --porcelain)" ]; then echo "Working tree dirty"; exit 1; fi
	@echo "Releasing v$(VERSION)..."
	git tag -a "v$(VERSION)" -m "v$(VERSION)"
	git push origin "v$(VERSION)"
	gh release create "v$(VERSION)" --title "v$(VERSION)" --generate-notes
	@echo "Release v$(VERSION) created. GitHub Actions will publish to npm and update Homebrew."
