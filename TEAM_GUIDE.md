# Team Collaboration Guide

## 1. Getting Access
To start working on this project, you need to be added as a **Collaborator**.
1. Give your GitHub username to the project owner (Sai Madhu).
2. Accept the invitation sent to your email or GitHub notifications.

## 2. Setting Up the Project (First Time)
Open your terminal (Command Prompt, PowerShell, or Git Bash) and run:

```bash
# Clone the repository to your local machine
git clone https://github.com/jonnalagaddalakshmisaimadhu/Team-Approval-Intelligence-TAI-.git

# Move into the project folder
cd Team-Approval-Intelligence-TAI-

# Install dependencies (Frontend)
cd src
npm install
cd ..

# Install dependencies  (Backend - if using Python)
# (Adjust command based on your setup, e.g., pip install -r requirements.txt)
```

## 3. Daily Workflow (How to contribute)

**Step 1: Get the latest changes**
Before you start working, ALWAYS pull the latest code to avoid conflicts.
```bash
git pull origin main
```

**Step 2: Make your changes**
Edit files, fix bugs, or add features.

**Step 3: Save your changes**
```bash
# See what files you changed
git status

# Add files to the staging area
git add . 

# Commit your changes with a message
git commit -m "Describe what you did here"
```

**Step 4: Share your changes**
```bash
git push origin main
```

## 4. Handling Conflicts
If `git push` fails, someone else might have pushed changes while you were working.
1. Run `git pull origin main`.
2. Git will tell you which files have "conflicts".
3. Open those files, look for `<<<<<<<`, `=======`, and `>>>>>>>`.
4. Fix the code to look how you want it.
5. Save, then run:
   ```bash
   git add .
   git commit -m "Fixed merge conflicts"
   git push origin main
   ```
