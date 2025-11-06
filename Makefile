# Define the paths to important directories
PROJECT_ROOT := $(shell pwd)
SRC_TAURI := $(PROJECT_ROOT)/src-tauri
DIST_DIR := $(PROJECT_ROOT)/dist
CONFIG_FILE := $(SRC_TAURI)/tauri.conf.json

# Detect host platform
ifeq ($(OS),Windows_NT)
HOST_IS_WINDOWS := 1
WINDOWS_TARGET := x86_64-pc-windows-msvc
else
HOST_IS_WINDOWS := 0
WINDOWS_TARGET := x86_64-pc-windows-gnu
endif


# Display help
help:
	@echo "Available targets:"
	@echo "  all             - Build everything for Windows (NSIS)"
	@echo "  clean           - Clean the project"
	@echo "  install-frontend- Install frontend dependencies"
	@echo "  build-frontend  - Build the frontend"
	@echo "  build-tauri-nsis- Build the Tauri app for Windows using NSIS"
	@echo "  build-tauri-msi - Build the Tauri app for Windows using MSI"
ifeq ($(HOST_IS_WINDOWS),1)
	@echo "  build-windows   - Build frontend and Windows bundle (native Windows host)"
else
	@echo "  windows-setup   - Install cross-compilation prerequisites on macOS"
	@echo "  build-windows   - Run setup, build frontend, and produce NSIS bundle"
endif
	@echo "  windows-only    - Clean, build everything for Windows, and generate the NSIS installer"
	@echo "  nsis            - Clean, build everything, and generate the NSIS installer"
	@echo "  msi             - Clean, build everything, and generate the MSI installer"
	@echo "  dev             - Run the Tauri app in development mode"
	@echo "  rust-test       - Run Rust unit tests in src-tauri"
	@echo "  rust-coverage   - Run Rust coverage with cargo-tarpaulin (if installed)"
	@echo "  help            - Display this help message"


# Default target: Build everything for Windows (using NSIS as default)
all: windows-only

# Clean the project
clean:
	@echo "Cleaning the project..."
	@cd $(SRC_TAURI) && cargo clean
	@rm -rf $(DIST_DIR)
	rm -rf node_modules package-lock.json
	npm cache clean --force
	npm ci

# Install frontend dependencies (if needed)
install-frontend:
	@echo "Installing frontend dependencies..."
	@npm install

# Build the frontend (this runs your beforeBuildCommand)
build-frontend:
	@echo "Building the frontend..."
	@npm run build

# Prepare the macOS toolchain for Windows cross-compilation
windows-setup:
ifeq ($(HOST_IS_WINDOWS),1)
	@echo "windows-setup: native Windows host detected; no cross-compilation prerequisites needed."
else
	@echo "=== Preparing macOS for Windows cross-compilation ==="
	@if ! command -v rustup >/dev/null 2>&1; then \
		echo "rustup is required. Install Rust (https://rustup.rs/) and rerun."; \
		exit 1; \
	fi
	@if ! rustup target list --installed | grep -q '$(WINDOWS_TARGET)'; then \
		echo "Adding Rust target $(WINDOWS_TARGET)..."; \
		rustup target add $(WINDOWS_TARGET); \
	else \
		echo "Rust target $(WINDOWS_TARGET) already installed."; \
	fi
	@if ! command -v brew >/dev/null 2>&1; then \
		echo "Homebrew is required. Install from https://brew.sh/ and rerun."; \
		exit 1; \
	fi
	@if ! brew list mingw-w64 >/dev/null 2>&1; then \
		echo "Installing mingw-w64 via Homebrew (may take a while)..."; \
		brew install mingw-w64; \
	else \
		echo "mingw-w64 already installed."; \
	fi
	@echo "Setup complete. Ensure your shell can find x86_64-w64-mingw32-gcc."
endif

# Build the Tauri app for Windows using NSIS
build-tauri-nsis:
	@echo "Building the Tauri application for Windows (NSIS)..."
	@echo "Project Root...${PROJECT_ROOT}"
	@sed 's/"targets": \[[^]]*\]/"targets": ["nsis"]/' $(CONFIG_FILE) > $(CONFIG_FILE).tmp
	@mv $(CONFIG_FILE).tmp $(CONFIG_FILE)
ifeq ($(HOST_IS_WINDOWS),1)
	@cd $(PROJECT_ROOT) && cargo tauri build
else
	@if ! command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then \
		echo "x86_64-w64-mingw32-gcc not found. Run 'make windows-setup' first."; \
		exit 1; \
	fi
	@cd $(PROJECT_ROOT) && \
		PKG_CONFIG_ALLOW_CROSS=1 \
		CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=$$(command -v x86_64-w64-mingw32-gcc) \
		cargo tauri build --target $(WINDOWS_TARGET)
endif

# Build the Tauri app for Windows using MSI
build-tauri-msi:
	@echo "Building the Tauri application for Windows (MSI)..."
	@sed 's/"targets": \[[^]]*\]/"targets": ["msi"]/' $(CONFIG_FILE) > $(CONFIG_FILE).tmp
	@mv $(CONFIG_FILE).tmp $(CONFIG_FILE)
ifeq ($(HOST_IS_WINDOWS),1)
	@cd $(PROJECT_ROOT) && cargo tauri build --target $(WINDOWS_TARGET)
else
	@if ! command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then \
		echo "x86_64-w64-mingw32-gcc not found. Run 'make windows-setup' first."; \
		exit 1; \
	fi
	@cd $(PROJECT_ROOT) && \
		PKG_CONFIG_ALLOW_CROSS=1 \
		CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=$$(command -v x86_64-w64-mingw32-gcc) \
		cargo tauri build --target $(WINDOWS_TARGET)
endif

# Generate the NSIS installer (Windows only)
windows-only: clean build-frontend build-tauri-nsis

# Full build including setup
build-windows:
ifeq ($(HOST_IS_WINDOWS),1)
	@$(MAKE) clean
	@$(MAKE) build-frontend
	@$(MAKE) build-tauri-nsis
else
	@$(MAKE) windows-setup
	@$(MAKE) clean
	@$(MAKE) build-frontend
	@$(MAKE) build-tauri-nsis
endif

# Generate the NSIS installer
nsis: clean build-frontend build-tauri-nsis

# Generate the MSI installer
msi: clean build-frontend build-tauri-msi

# Run the Tauri app in development mode
dev:
	@echo "Running in development mode..."
	@cd $(PROJECT_ROOT) && cargo tauri dev

# Run Rust unit tests
rust-test:
	@cd $(SRC_TAURI) && cargo test

# Run Rust coverage (requires cargo-tarpaulin installed: cargo install cargo-tarpaulin)
rust-coverage:
	@command -v cargo-tarpaulin >/dev/null 2>&1 || { echo "cargo-tarpaulin not found. Install with: cargo install cargo-tarpaulin"; exit 1; }
	@cd $(SRC_TAURI) && cargo tarpaulin -o Lcov --output-dir coverage --engine llvm --ignore-tests
