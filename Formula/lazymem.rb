class Lazymem < Formula
  desc "Terminal UI memory monitor for macOS dev environments"
  homepage "https://github.com/JayFarei/lazymem"
  license "MIT"
  version "0.2.1"
  head "https://github.com/JayFarei/lazymem.git", branch: "main"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/JayFarei/lazymem/releases/download/v#{version}/lazymem-v#{version}-aarch64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_ARM64_SHA256"
    else
      url "https://github.com/JayFarei/lazymem/releases/download/v#{version}/lazymem-v#{version}-x86_64-apple-darwin.tar.gz"
      sha256 "PLACEHOLDER_X86_64_SHA256"
    end
  end

  def install
    bin.install "bin/lazymem"
    pkgshare.install "README.md", "LICENSE"
    pkgshare.install "skill"
  end

  test do
    assert_match "lazymem v#{version}", shell_output("#{bin}/lazymem --version")
  end
end
