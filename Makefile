# Define the paths to important directories
PROJECT_ROOT := $(shell pwd)
SRC_TAURI := $(PROJECT_ROOT)/src-tauri
DIST_DIR := $(PROJECT_ROOT)/dist
CONFIG_FILE := $(SRC_TAURI)/tauri.conf.json

# Define the build targets for Windows
WINDOWS_TARGET := x86_64-pc-windows-gnu

# Default target: Build everything (using NSIS as default)
all: clean build-frontend build-tauri-nsis

# Clean the project
clean:
	@echo "Cleaning the project..."
	@cd $(SRC_TAURI) && cargo clean
	@rm -rf $(DIST_DIR)

# Install frontend dependencies (if needed)
install-frontend:
	@echo "Installing frontend dependencies..."
	@npm install

# Build the frontend (this runs your beforeBuildCommand)
build-frontend:
	@echo "Building the frontend..."
	@npm run build

# Build the Tauri app for Windows using NSIS
build-tauri-nsis:
	@echo "Building the Tauri application for Windows (NSIS)..."
	@echo "Project Root...${PROJECT_ROOT}"
	@sed 's/"targets": \[[^]]*\]/"targets": ["nsis"]/' $(CONFIG_FILE) > $(CONFIG_FILE).tmp
	@mv $(CONFIG_FILE).tmp $(CONFIG_FILE)
	@cd $(PROJECT_ROOT) && cargo tauri build --target $(WINDOWS_TARGET)

# Build the Tauri app for Windows using MSI
build-tauri-msi:
	@echo "Building the Tauri application for Windows (MSI)..."
	@sed 's/"targets": \[[^]]*\]/"targets": ["msi"]/' $(CONFIG_FILE) > $(CONFIG_FILE).tmp
	@mv $(CONFIG_FILE).tmp $(CONFIG_FILE)
	@cd $(PROJECT_ROOT) && cargo tauri build --target $(WINDOWS_TARGET)

# Generate the NSIS installer
nsis: clean build-frontend build-tauri-nsis

# Generate the MSI installer
msi: clean build-frontend build-tauri-msi

# Run the Tauri app in development mode
dev:
	@echo "Running in development mode..."
	@cd $(PROJECT_ROOT) && cargo tauri dev

# Display help
help:
	@echo "Available targets:"
	@echo "  all             - Clean, build frontend, and build Tauri app using NSIS"
	@echo "  clean           - Clean the project"
	@echo "  install-frontend- Install frontend dependencies"
	@echo "  build-frontend  - Build the frontend"
	@echo "  build-tauri-nsis- Build the Tauri app for Windows using NSIS"
	@echo "  build-tauri-msi - Build the Tauri app for Windows using MSI"
	@echo "  nsis            - Clean, build everything, and generate the NSIS installer"
	@echo "  msi             - Clean, build everything, and generate the MSI installer"
	@echo "  dev             - Run the Tauri app in development mode"
	@echo "  help            - Display this help message"
