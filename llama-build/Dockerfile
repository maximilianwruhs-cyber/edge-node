# Native Compilation targeting the exact driver version found on your host (CUDA 12.2)
FROM nvidia/cuda:12.2.2-devel-ubuntu22.04

RUN apt-get update && apt-get install -y build-essential cmake git curl libcurl4-openssl-dev

WORKDIR /app
ARG CUDA_ARCH=native

# Fix: Docker build stage has no GPU driver. The linker needs libcuda.so.1
# which only exists at runtime. NVIDIA provides stubs for exactly this purpose.
RUN ln -s /usr/local/cuda/lib64/stubs/libcuda.so /usr/local/cuda/lib64/stubs/libcuda.so.1 2>/dev/null || true
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64/stubs:${LD_LIBRARY_PATH}

RUN git clone https://github.com/ggml-org/llama.cpp.git && cd llama.cpp && \
    git checkout b8665 && \
    LDFLAGS="-L/usr/local/cuda/lib64/stubs" \
    cmake -B build -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES="${CUDA_ARCH}" \
      -DCMAKE_EXE_LINKER_FLAGS="-L/usr/local/cuda/lib64/stubs" \
      -DCMAKE_SHARED_LINKER_FLAGS="-L/usr/local/cuda/lib64/stubs" && \
    cmake --build build --config Release --target llama-server -j 4

# Critical: Unset stubs path so runtime uses the real GPU driver injected by nvidia-container-toolkit
ENV LD_LIBRARY_PATH=

ENTRYPOINT ["/app/llama.cpp/build/bin/llama-server"]
