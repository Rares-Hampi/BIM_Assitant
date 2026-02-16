FROM python:3.10-slim

WORKDIR /workspace

# Install dependencies (Git, Wget, Unzip)
RUN apt-get update && apt-get install -y wget unzip && rm -rf /var/lib/apt/lists/*

# Install Python IFC library
RUN pip install ifcopenshell

# Install the Geometry Engine (IfcConvert) - No Blender needed!
RUN wget https://s3.amazonaws.com/ifcopenshell-builds/IfcConvert-v0.7.0-f0e03c7-linux64.zip -O /tmp/ifcconvert.zip && \
    unzip /tmp/ifcconvert.zip -d /usr/local/bin/ && \
    chmod +x /usr/local/bin/IfcConvert && \
    rm /tmp/ifcconvert.zip

COPY convert.py /workspace/convert.py

ENTRYPOINT ["python", "/workspace/convert.py"]