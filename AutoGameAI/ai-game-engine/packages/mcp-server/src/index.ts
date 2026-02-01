import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

// Create an MCP server
const server = new McpServer({
  name: "babylon-mcp-server",
  version: "1.0.0",
});

const API_BASE = "http://127.0.0.1:7314/api/babylon/tools";

async function forwardToBabylon(toolName: string, args: any) {
  try {
    const response = await axios.post(`${API_BASE}/${toolName}`, args);
    return {
      content: [
        {
          type: "text" as const,
          text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Error executing ${toolName}: ${error.message} ${error.response?.data ? JSON.stringify(error.response.data) : ''}`,
        },
      ],
    };
  }
}

// 0. Create Entity (Existing)
server.tool(
  "babylon_create_entity",
  "Create a new entity in the Babylon.js scene",
  {
    name: z.string().describe("The name of the entity to create"),
    type: z.string().describe("The type of entity (e.g., 'Box', 'Sphere', 'Ground', 'Light')"),
    position: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("Position of the entity"),
    rotation: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("Rotation of the entity"),
    scaling: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("Scaling of the entity"),
    parameters: z.record(z.any()).optional().describe("Additional parameters for the entity construction"),
  },
  async (args) => forwardToBabylon("babylon_create_entity", args)
);

// 1. Get Scene
server.tool(
  "babylon_get_scene",
  "Get the current scene information (meshes, lights, cameras)",
  {
    includeMeshes: z.boolean().optional().describe("Whether to include mesh details"),
    includeLights: z.boolean().optional().describe("Whether to include light details"),
    includeCameras: z.boolean().optional().describe("Whether to include camera details"),
  },
  async (args) => forwardToBabylon("babylon_get_scene", args)
);

// 2. Find Entities
server.tool(
  "babylon_find_entities",
  "Find entities in the scene based on criteria",
  {
    name: z.string().optional().describe("Filter by exact name or substring"),
    type: z.string().optional().describe("Filter by entity type (e.g. Mesh, Light)"),
  },
  async (args) => forwardToBabylon("babylon_find_entities", args)
);

// 3. Remove Entity
server.tool(
  "babylon_remove_entity",
  "Remove an entity from the scene",
  {
    name: z.string().describe("The name of the entity to remove"),
  },
  async (args) => forwardToBabylon("babylon_remove_entity", args)
);

// 4. Update Entity
server.tool(
  "babylon_update_entity",
  "Update an entity's properties (position, rotation, scaling)",
  {
    name: z.string().describe("The name of the entity to update"),
    position: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("New position"),
    rotation: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("New rotation"),
    scaling: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    }).optional().describe("New scaling"),
  },
  async (args) => forwardToBabylon("babylon_update_entity", args)
);

// 5. Get Entity
server.tool(
  "babylon_get_entity",
  "Get details of a specific entity",
  {
    name: z.string().describe("The name of the entity to retrieve"),
  },
  async (args) => forwardToBabylon("babylon_get_entity", args)
);

// --- Component Tools ---

// 6. Add Component
server.tool(
  "babylon_add_component",
  "Add a component to an entity (e.g., Physics, Material, Script)",
  {
    entityName: z.string().describe("The name of the entity"),
    componentType: z.string().describe("The type of component to add (e.g., 'PhysicsAggregate', 'StandardMaterial')"),
    parameters: z.record(z.any()).optional().describe("Configuration parameters for the component"),
  },
  async (args) => forwardToBabylon("babylon_add_component", args)
);

// 7. Remove Component
server.tool(
  "babylon_remove_component",
  "Remove a component from an entity",
  {
    entityName: z.string().describe("The name of the entity"),
    componentType: z.string().describe("The type of component to remove"),
  },
  async (args) => forwardToBabylon("babylon_remove_component", args)
);

// 8. Update Component
server.tool(
  "babylon_update_component",
  "Update a component on an entity",
  {
    entityName: z.string().describe("The name of the entity"),
    componentType: z.string().describe("The type of component to update"),
    parameters: z.record(z.any()).describe("New parameters for the component"),
  },
  async (args) => forwardToBabylon("babylon_update_component", args)
);


// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Babylon MCP Server running on stdio");
}

main();
