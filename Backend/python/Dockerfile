# FROM ubuntu:22.04

# # --- System setup ---
# ENV DEBIAN_FRONTEND=noninteractive
# WORKDIR /workspace

# # --- Install dependencies ---
# RUN apt-get update && apt-get install -y \
#     python3 python3-pip wget unzip xz-utils git \
#     libgl1 libxi6 libxrender1 libxxf86vm1 libxfixes3 \
#     libxdamage1 libxrandr2 libxcursor1 libxkbcommon0 \
#     libdbus-1-3 libsm6 libxext6 libxinerama1 libfontconfig1 \
#     && rm -rf /var/lib/apt/lists/*

# # Install Blender 4.2 LTS
# RUN wget https://mirror.clarkson.edu/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz && \
#     tar -xf blender-4.2.3-linux-x64.tar.xz -C /opt && \
#     ln -s /opt/blender-4.2.3-linux-x64/blender /usr/local/bin/blender && \
#     rm blender-4.2.3-linux-x64.tar.xz


# # Install BlenderBIM and check structure
# RUN wget https://github.com/IfcOpenShell/IfcOpenShell/releases/download/blenderbim-240610/blenderbim-240610-py311-linux.zip -O /tmp/blenderbim.zip && \
#     unzip /tmp/blenderbim.zip -d /opt/blender-4.2.3-linux-x64/4.2/scripts/addons/ && \
#     rm /tmp/blenderbim.zip && \
#     echo "=== Contents of addons directory ===" && \
#     ls -la /opt/blender-4.2.3-linux-x64/4.2/scripts/addons/ && \
#     echo "=== Checking for blenderbim ===" && \
#     find /opt/blender-4.2.3-linux-x64/4.2/scripts/addons/ -name "blenderbim" -o -name "__init__.py" | head -20



# # --- Tell Blender where to find add-ons ---
# # ENV BLENDER_USER_SCRIPTS=/addons

# # --- Copy conversion script ---
# COPY convert_script.py /workspace/convert_script.py

# # --- Run automatically ---
# ENTRYPOINT ["blender", "--background", "--python", "/workspace/convert_script.py"]


FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    python3 python3-pip wget unzip xz-utils \
    libgl1 libxi6 libxrender1 libxxf86vm1 libxfixes3 \
    libxdamage1 libxrandr2 libxcursor1 libxkbcommon0 \
    libdbus-1-3 libsm6 libxext6 libxinerama1 libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

# Install Blender 4.2 LTS
RUN wget https://mirror.clarkson.edu/blender/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz && \
    tar -xf blender-4.2.3-linux-x64.tar.xz -C /opt && \
    ln -s /opt/blender-4.2.3-linux-x64/blender /usr/local/bin/blender && \
    rm blender-4.2.3-linux-x64.tar.xz

# Try the v4.0.0 release (more stable structure)
RUN wget https://github.com/IfcOpenShell/IfcOpenShell/releases/download/blenderbim-240522/blenderbim-240522-py311-linux.zip -O /tmp/blenderbim.zip 
    
# Let Blender install AND enable the addon. This is the correct way.
RUN blender --background --python-expr "import bpy; \
    bpy.ops.preferences.addon_install(filepath='/tmp/blenderbim.zip'); \
    bpy.ops.preferences.addon_enable(module='blenderbim'); \
    bpy.ops.wm.save_userpref()"

# Clean up
RUN rm /tmp/blenderbim.zip

COPY convert.py /workspace/convert.py

ENTRYPOINT ["blender", "--background", "--python", "/python/convert.py"]
